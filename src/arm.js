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
 * The gate appended to an armed block.
 *
 * `"0 1"` is two equal halves of one cycle; slowed to twice the countdown it
 * becomes `cycles` of silence followed by `cycles` of sound. `.late(phase)`
 * slides that so the silent half begins on the cycle the button was pressed -
 * without it the gate would sit wherever the free-running clock has it, and a
 * press two cycles into the window would flip immediately.
 *
 * Measured against Strudel rather than assumed: `"0 1".slow(8).late(2)` reads
 * [1,1, 0,0,0,0, 1,1,1] across cycles 0..8. `square` was the other candidate
 * and is wrong - it runs -1..1, so it would invert the block rather than mute
 * it.
 *
 * `.mul(gain(...))` rather than `.gain(...)`, for the same reason the rip fade
 * does it: a plain `.gain()` at the end of a chain replaces whatever gain the
 * block set for itself, so a quiet part would jump to full volume on arming.
 */
export function armChain(action, cycles, startCycle) {
  if (cycles <= 0) return '';
  const period = cycles * 2;
  const phase = ((startCycle % period) + period) % period;
  const steps = action === 'stop' ? '1 0' : '0 1';
  return `.mul(gain("${steps}".slow(${period}).late(${phase.toFixed(4)})))`;
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
    return isFadeable(rendered, block);
  });
}

/**
 * Appends the gate to each armed block, reporting where text was inserted so
 * mini-notation offsets can be corrected afterwards - see rip.js's
 * `unshiftLocations`, which consumes these unchanged.
 */
export function applyArm(lines, blocks, action, cycles, startCycle) {
  const chain = armChain(action, cycles, startCycle);
  if (!chain || blocks.length === 0) return { lines, edits: [] };

  const next = [...lines];
  const edits = [];
  // Offsets are computed on the ORIGINAL line lengths and corrected by the
  // insertions already made above them, so the walk stays single-pass.
  const byLine = new Map(blocks.map((b) => [b.end, b]));
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
