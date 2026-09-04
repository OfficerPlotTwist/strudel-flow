import { isBlockCommented, uncommentForPlayback } from './blocks.js';
import { isFadeable } from './rip.js';

/**
 * Arming a block: play or stop it, but not yet - a countdown of whole cycles
 * set by the crossfader, so a change lands on a bar line rather than whenever
 * a finger happened to arrive.
 *
 * The countdown is expressed in Strudel notation rather than a JS timer. That
 * matters: a setTimeout fires on wall-clock drift and lands wherever the
 * scheduler happens to be, whereas a gate written into the pattern is resolved
 * by the same clock the music is on, so the change is exactly on the cycle.
 *
 * Everything here is pure text-in / text-out, like rip.js. The timing lives in
 * live.js (which renders the gate into what the parser sees) and actions.js
 * (which commits the real edit when the countdown lands).
 */

/** Cycles at the far end of the crossfader. */
export const ARM_MAX_CYCLES = 4;

/**
 * Crossfader position (0..1, as device-map reports it) to whole cycles.
 *
 * Clamped rather than trusted: a control the app has never seen a value from
 * reports nothing at all, and a negative countdown would render a gate whose
 * period is zero.
 */
export function crossfaderCycles(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  return Math.round(Math.min(1, Math.max(0, v)) * ARM_MAX_CYCLES);
}

/**
 * Which whole cycle the change lands on.
 *
 * A press arrives wherever the transport happens to be - cycle 3.7, say - and
 * a countdown measured from there lands at 5.7, half way through a bar. So the
 * count is measured to the next bar line and runs whole cycles from there.
 * Hard left on the crossfader is zero cycles, which is not "this instant" but
 * "the next downbeat": the soonest musical moment, not the soonest moment.
 */
export function armTarget(pressCycle, cycles) {
  return Math.ceil(pressCycle) + cycles;
}

/**
 * The gate appended to an armed block, opening or closing exactly on
 * `targetCycle`.
 *
 * `"0 1"` is two equal halves of one cycle; slowed to `2h` it becomes h cycles
 * of silence followed by h of sound, and `.late(phase)` slides the pair so the
 * flip lands where it is wanted. Measured against Strudel rather than assumed:
 * `"0 1".slow(8).late(2)` reads [1,1, 0,0,0,0, 1,1,1] across cycles 0..8, so
 * the closed half spans [phase, phase + h) and the flip is at phase + h.
 *
 * The half has to be long enough to cover the part-cycle between the press and
 * the first bar line as well as the whole cycles after it - hence
 * `ceil(target - press)` rather than the crossfader's count. A half of exactly
 * the count would leave the moments before the first bar line uncovered, and
 * the block would sound for a fraction of a cycle before going quiet again.
 *
 * `.mul(gain(...))` rather than `.gain(...)`, for the same reason the rip fade
 * does it: a plain `.gain()` at the end of a chain replaces whatever gain the
 * block set for itself, so a quiet part would jump to full volume on arming.
 */
function armChainFor(action, period, phase) {
  const steps = action === 'stop' ? '1 0' : '0 1';
  return `.mul(gain("${steps}".slow(${period}).late(${phase.toFixed(4)})))`;
}

export function armChain(action, pressCycle, targetCycle) {
  const wait = targetCycle - pressCycle;
  if (wait <= 0) return '';
  // At least two cycles, not one. The open half is the grace period: the
  // gate repeats, so once it has flipped the block only stays flipped for
  // `half` cycles before the pattern comes round again. The buffer commit
  // removes the gate at the target and normally lands first, but a one-cycle
  // half leaves no margin at all if that timer runs late.
  const half = Math.max(2, Math.ceil(wait));
  const period = half * 2;
  const phase = (((targetCycle - half) % period) + period) % period;
  return armChainFor(action, period, phase);
}

/**
 * Could this block's first line begin a statement?
 *
 * `isFadeable` asks whether a block makes SOUND, and answers by rejecting a
 * short list of statement keywords. That is not the same question as whether
 * the text is code at all, and the difference is not academic: a play target
 * is judged on its UNCOMMENTED text, so a block of prose comments - a header,
 * a paragraph of transcription notes - uncomments into
 * `===========` and `GET GOT -- Death Grips (The Money Store, 2012)`, sails
 * past every keyword check, and is handed to the parser as source. That is
 * where "unexpected token" came from on playing a block of the Get Got song.
 *
 * Only the first non-blank line is tested, because continuation lines of a
 * chain legitimately start with a dot.
 */
function looksLikeCode(lines, block) {
  for (let i = block.start; i <= block.end; i += 1) {
    const trimmed = lines[i].trim();
    // Blank lines and COMMENTS are not the block's first statement. Judging a
    // block by its comment rejected every part that carries a label above it -
    // which, once each block was given a one-line description, was all of
    // them: the whole song became unarmable and play did nothing.
    if (!trimmed || trimmed.startsWith('//')) continue;
    return (
      // `$: pattern` or `name: pattern`
      /^(\$|[A-Za-z_$][\w$]*)\s*:/.test(trimmed) ||
      // a definition the rest of the song refers to
      /^(const|let|var|function)\s/.test(trimmed) ||
      // a bare call - `s("bd")`, `stack(`
      /^[A-Za-z_$][\w$]*\s*\(/.test(trimmed)
    );
  }
  return false;
}

/** A chain of the same shape as any real one, for the parse check below. */
const SPECIMEN_CHAIN = armChainFor('play', 4, 0);

/**
 * The line the gate is appended to: the block's last line that is not a
 * comment.
 *
 * Not simply `block.end`. A block often ends with a trailing note - a comment
 * explaining the part - and a chain appended after that lands INSIDE the
 * comment, where it parses cleanly and does nothing at all. Refusing to arm
 * such a block would be worse than the bug; attaching to the code above it is
 * what the author meant.
 */
export function attachLine(lines, block) {
  for (let i = block.end; i >= block.start; i -= 1) {
    const trimmed = lines[i].trim();
    if (trimmed && !trimmed.startsWith('//')) return i;
  }
  return block.end;
}

/**
 * Would appending the gate to this block still parse?
 *
 * `looksLikeCode` catches prose. This catches everything else - a block left
 * mid-expression, on a dangling comma, or otherwise unable to accept a method
 * call - without having to enumerate the shapes in advance. There is no
 * general rule saying the attach line can take a `.mul(...)`, so the honest
 * test is to try it.
 *
 * `$:` and bare `name:` labels are Strudel's, not JavaScript's, so they are
 * rewritten to assignments before parsing. Undefined identifiers are fine:
 * `new Function` compiles, it does not run, so a block referring to a `const`
 * defined elsewhere in the song still parses on its own.
 */
function chainParses(lines, block) {
  const text = lines
    .slice(block.start, attachLine(lines, block) + 1)
    .join('\n')
    .replace(/^(\s*)\$:/gm, '$1const _armProbe =')
    .replace(/^(\s*)([A-Za-z_$][\w$]*):(?!\/)/gm, '$1const $2 =');
  try {
    // eslint-disable-next-line no-new-func
    new Function(`${text}${SPECIMEN_CHAIN}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Which of the selected blocks the action actually applies to.
 *
 * A block already in the requested state is passed over rather than re-armed:
 * hitting play on something already playing should be nothing at all, not a
 * countdown to a state it is already in. Statements that make no sound are
 * passed over too - `setcpm(120).mul(gain(...))` is a syntax error, not a
 * countdown.
 */
export function armable(lines, blocks, action) {
  return blocks.filter((block) => {
    const stopped = isBlockCommented(lines, block.start, block.end);
    if (action === 'play' ? !stopped : stopped) return false;
    // A stopped block is commented, and `isFadeable` reads a commented line as
    // no code at all - so asking it about a block queued to PLAY has to be
    // asked about the text that will actually be rendered, which is the block
    // with its markers removed. Judging the commented form instead would
    // reject every block the play button exists to start.
    const rendered = stopped ? uncommentForPlayback(lines, [block]) : lines;
    return (
      looksLikeCode(rendered, block) &&
      isFadeable(rendered, block) &&
      chainParses(rendered, block)
    );
  });
}

/**
 * Appends the gate to each armed block, reporting where text was inserted so
 * mini-notation offsets can be corrected afterwards - see rip.js's
 * `unshiftLocations`, which consumes these unchanged.
 */
export function applyArm(lines, blocks, action, pressCycle, targetCycle) {
  const chain = armChain(action, pressCycle, targetCycle);
  if (!chain || blocks.length === 0) return { lines, edits: [] };

  const next = [...lines];
  const edits = [];
  // Offsets are computed on the ORIGINAL line lengths and corrected by the
  // insertions already made above them, so the walk stays single-pass.
  const byLine = new Map(blocks.map((b) => [attachLine(lines, b), b]));
  let inserted = 0;
  let offset = 0;
  for (let i = 0; i < next.length; i += 1) {
    const lineLength = next[i].length;
    if (byLine.has(i)) {
      edits.push({ at: offset + lineLength + inserted, length: chain.length });
      next[i] += chain;
      inserted += chain.length;
    }
    offset += lineLength + 1; // +1 for the newline join
  }
  return { lines: next, edits };
}
