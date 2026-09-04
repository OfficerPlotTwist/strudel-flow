import { describe, scanFunctions } from './explain.js';
import { maskCode } from './args.js';

/**
 * Scrolling the functions of one block, and swapping one out for a library
 * pick.
 *
 * The knobs edit a block's NUMBERS; this edits its WORDS. `s("bd")` and
 * `s("piano")` differ by a word, `.lpf(400)` and `.hpf(400)` differ by a word,
 * and neither is reachable by turning a value knob however far.
 *
 * Which library list a pick should come from is not a fourth thing to
 * remember: it follows from the function under the cursor. A sample function
 * wants a sound, a pattern function wants a pattern, an effect wants another
 * effect - so selecting the function is also what tabs the panel to the list
 * that can answer it. Categories come from the docs (see explain.js), not from
 * a hand-kept list here, so a function this app has never heard of still lands
 * somewhere sensible.
 */

/** Which library tab answers a function of this category. */
const TAB_BY_CATEGORY = {
  sample: 'sounds',
  synth: 'sounds',
  pattern: 'snippets',
  harmony: 'snippets',
};

/**
 * The library tab that can replace this function's argument.
 *
 * Everything that is not a sound or a pattern is an effect as far as this is
 * concerned, and an effect is replaced by another effect - so it browses the
 * function list rather than a list of values.
 */
export function targetTab(name) {
  const info = describe(name);
  if (!info) return 'funcs';
  return TAB_BY_CATEGORY[info.category] ?? 'funcs';
}

/** Whether a pick replaces the function's ARGUMENT or the function itself. */
export function replaceKind(name) {
  return targetTab(name) === 'funcs' ? 'function' : 'argument';
}

/**
 * The span of the balanced `(...)` following a name at `to`, or null.
 *
 * Balanced rather than "up to the next paren", so `.lpf(saw.range(200, 2000))`
 * is one argument and not half of one - the same reason fx.js scans for the
 * matching close.
 */
function argumentSpan(code, to) {
  let i = to;
  while (i < code.length && /\s/.test(code[i])) i += 1;
  if (code[i] !== '(') return null;
  let depth = 0;
  for (let j = i; j < code.length; j += 1) {
    if (code[j] === '(') depth += 1;
    else if (code[j] === ')') {
      depth -= 1;
      if (depth === 0) return { from: i + 1, to: j };
    }
  }
  return null;
}

/**
 * Every documented function call in `text`, in source order, with the spans a
 * replacement needs.
 *
 * Offsets are relative to `text`; pass `offset` to rebase onto the document.
 * Functions inside comments and strings are skipped - a name in a comment is
 * not running, and `s("bd sd")` contains no call named `sd`.
 */
export function blockFunctions(text, offset = 0) {
  const masked = maskCode(text);
  const out = [];
  for (const hit of scanFunctions(masked)) {
    const args = argumentSpan(masked, hit.to);
    // A bare name that is not called - `sine` in `.pan(sine)` - has nothing to
    // replace an argument of, so it is not a stop on this list.
    if (!args) continue;
    out.push({
      name: hit.name,
      from: hit.from + offset,
      to: hit.to + offset,
      argFrom: args.from + offset,
      argTo: args.to + offset,
      arg: text.slice(args.from, args.to),
      tab: targetTab(hit.name),
      replaces: replaceKind(hit.name),
    });
  }
  return out;
}

/**
 * The edit a library pick makes to the browsed function, as
 * `{ from, to, text }`, or null when the pick cannot answer it.
 *
 * An effect swaps the NAME and keeps its argument, because the number in
 * `.lpf(400)` is a cutoff whichever filter reads it, and throwing it away
 * would turn a swap into a reset. A sound or pattern swaps the ARGUMENT and
 * keeps the call, for the mirror-image reason: `s(...)` is still what plays it.
 */
export function replacementFor(fn, pick) {
  if (!fn || !pick) return null;
  if (fn.replaces === 'function') {
    // Only a function can replace a function; a sound name here would produce
    // `bd(400)`, which parses and then fails at run time.
    if (pick.kind !== 'funcs') return null;
    return { from: fn.from, to: fn.to, text: pick.name };
  }
  if (pick.kind === 'sounds') {
    return { from: fn.argFrom, to: fn.argTo, text: `"${pick.name}"` };
  }
  if (pick.kind === 'snippets' || pick.kind === 'songs') {
    // A whole snippet is a statement, not an argument. What CAN be lifted out
    // of it is its head call's mini-notation - the pattern itself - which is
    // exactly what is being asked for here.
    const mini = /^\s*(?:\$|[a-z]\w*)?\s*:?\s*[A-Za-z_$][\w$]*\(\s*("(?:[^"\\]|\\.)*")\s*\)/m.exec(
      pick.code ?? '',
    );
    return mini ? { from: fn.argFrom, to: fn.argTo, text: mini[1] } : null;
  }
  return null;
}

/** Step a cursor through `count` functions, wrapping - these are endless encoders. */
export function stepFunction(index, delta, count) {
  if (count <= 0) return null;
  return (((index + delta) % count) + count) % count;
}
