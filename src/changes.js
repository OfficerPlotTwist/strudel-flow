import { scanFunctions } from './explain.js';
import { isBlockCommented, listBlocks, uncommentForPlayback } from './blocks.js';

/**
 * What just changed in the code, so the explainer can describe the thing the
 * performer's hands were last on rather than whatever the caret happens to sit
 * beside.
 *
 * Two kinds of change are worth reading about:
 *
 *   appended  a function chained onto a line that did not have it
 *   retuned   the same call, in the same place, with different arguments
 *
 * A removal is neither. There is no function left to describe, and pointing
 * the explainer at text that is gone would be worse than leaving it where it
 * was.
 */

/**
 * Every documented call in `code`, in source order, with the text between its
 * parentheses.
 *
 * Argument text is captured by walking balanced parens rather than by regex,
 * because `mul(gain(0.5))` is one argument containing another call and a
 * non-greedy match would stop at the first `)`.
 */
export function callsIn(code) {
  const calls = [];
  for (const hit of scanFunctions(code)) {
    let i = hit.to;
    while (i < code.length && /\s/.test(code[i])) i += 1;
    if (code[i] !== '(') {
      // A documented name used without calling it - `isaw` in a chain, say.
      calls.push({ ...hit, args: null, argsFrom: null, argsTo: null });
      continue;
    }
    const open = i;
    let depth = 0;
    for (; i < code.length; i += 1) {
      if (code[i] === '(') depth += 1;
      else if (code[i] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    calls.push({
      ...hit,
      args: code.slice(open + 1, i),
      argsFrom: open + 1,
      argsTo: i,
    });
  }
  return calls;
}

/**
 * What changed between two versions of the code.
 *
 * Occurrences are matched up per function NAME, in order. That is what lets a
 * second `.fast(3)` after an existing `.fast(2)` read as a new call rather
 * than as the first one being retuned: the first occurrences pair off and
 * agree, and the leftover is an addition.
 *
 * Returns source order in `after`, so a rotation reads left to right along the
 * line the way it was typed.
 */
export function diffCalls(before, after) {
  const previous = new Map();
  for (const call of callsIn(before)) {
    if (!previous.has(call.name)) previous.set(call.name, []);
    previous.get(call.name).push(call);
  }

  const seen = new Map();
  const changes = [];
  for (const call of callsIn(after)) {
    const index = seen.get(call.name) ?? 0;
    seen.set(call.name, index + 1);
    const older = previous.get(call.name)?.[index];
    if (!older) {
      changes.push({ ...call, kind: 'appended', was: null });
    } else if (older.args !== call.args) {
      changes.push({ ...call, kind: 'retuned', was: older.args });
    }
  }
  return changes;
}

/**
 * Every function occurrence in `code`, with whether it is in a block that is
 * actually playing - the two facts the colouring needs.
 *
 * The awkward part is that `scanFunctions` deliberately discards comments, so
 * that a commented-out `.fast(2)` never claims to be part of the running song.
 * That is right for the explainer's "functions in use" list and wrong here,
 * where a muted block still has to be coloured, just dimly.
 *
 * The way round it is `uncommentForPlayback`, which replaces each `//` with
 * two spaces rather than deleting it. Because it is length-preserving, every
 * offset found in the uncommented projection is the same offset in the real
 * document - so a commented block can be scanned without any of its positions
 * needing to be mapped back.
 */
export function functionSpans(code) {
  const lines = code.split('\n');
  const blocks = listBlocks(lines);
  const bare = uncommentForPlayback(lines, blocks).join('\n');

  // Line start offsets, so an occurrence can be traced back to its block.
  const lineStart = [];
  let at = 0;
  for (const line of lines) {
    lineStart.push(at);
    at += line.length + 1;
  }
  const lineOf = (offset) => {
    let low = 0;
    let high = lineStart.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (lineStart[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low;
  };

  const live = blocks.map((block) => !isBlockCommented(lines, block.start, block.end));

  return scanFunctions(bare).map((hit) => {
    const line = lineOf(hit.from);
    const index = blocks.findIndex((b) => b.start <= line && line <= b.end);
    return { ...hit, live: index === -1 ? true : live[index] };
  });
}
