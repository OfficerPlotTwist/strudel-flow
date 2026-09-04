/**
 * Building one block out of several library picks, from the control surface.
 *
 * The library already inserts a single entry (see main.js `onInsert`), and
 * that is a different act from this one: inserting drops a finished thing into
 * the song, whereas building ADDS to a block that is still being assembled.
 * The difference shows up the moment a second sound is picked. Inserted, it
 * becomes a second block playing alongside the first; added, it belongs in the
 * same part and the two should take turns.
 *
 * So the rule here is alternation: picking `bd` then `sd` produces
 * `s("<bd sd>")`, one per cycle, not two kick drums at once. Angle brackets
 * are Strudel's own way of saying that, and it is the only combining form
 * where each new pick is visible and removable as its own word.
 *
 * Everything in this file is pure text. What is under the browse cursor, when
 * a block is committed and what the knobs bind to afterwards all live in
 * main.js, where the rest of the surface's state already is.
 */

/**
 * Statements that must lead the document rather than join a block.
 *
 * `setcpm` sets the tempo of the whole song and `samples` loads a bank both
 * must exist before anything references them. Appended to a block halfway
 * down, they still "work" - and then the next block built above them changes
 * tempo mid-song for no visible reason.
 */
const SETUP = /^(setcpm|setcps|samples|await)\b/;

/** Where a picked entry belongs. */
export function classifyItem(code) {
  const trimmed = (code ?? '').trim();
  if (!trimmed) return 'empty';
  // A leading dot is a method with no receiver - it can only chain onto
  // whatever is already there, never stand as a block.
  if (trimmed.startsWith('.')) return 'fragment';
  if (SETUP.test(trimmed)) return 'setup';
  return 'pattern';
}

/**
 * A block split into the call that opens it and the chain hanging off it.
 *
 * The head is the first line, which is where a pattern names its sound or its
 * notes; the tail is every `.method()` line under it. Alternation happens in
 * the head and nowhere else - two picks share one chain, because the chain is
 * how the part sounds and the head is what it plays.
 */
export function splitChain(code) {
  const lines = code.replace(/\r/g, '').split('\n');
  return { head: lines[0] ?? '', tail: lines.slice(1) };
}

/**
 * `$: s("bd*4")` -> `{ label: '$: ', fn: 's', arg: 'bd*4' }`.
 *
 * Only a call whose entire argument is one double-quoted string can alternate,
 * because that string is the mini-notation and `<a b>` is a mini-notation
 * form. `n(0)` and `s("bd").gain(1)` both return null - the first has nothing
 * to put brackets around, and the second is not just a head.
 */
export function headCall(line) {
  const match = /^(\s*(?:\$|[a-z]\w*)\s*:\s*)?([A-Za-z_$][\w$]*)\(\s*"([^"]*)"\s*\)\s*$/.exec(
    line ?? '',
  );
  if (!match) return null;
  return { label: match[1] ?? '', fn: match[2], arg: match[3] };
}

/** The words already alternating in a mini-notation string, or the whole of it. */
function alternatives(arg) {
  const wrapped = /^<(.*)>$/.exec(arg.trim());
  if (!wrapped) return [arg.trim()];
  // Split on top-level spaces only: `<bd [sd sd] hh>` is three alternatives,
  // and the group in the middle is one of them.
  const out = [];
  let depth = 0;
  let word = '';
  for (const char of wrapped[1]) {
    if ('[<('.includes(char)) depth += 1;
    else if (']>)'.includes(char)) depth -= 1;
    if (char === ' ' && depth === 0) {
      if (word) out.push(word);
      word = '';
    } else {
      word += char;
    }
  }
  if (word) out.push(word);
  return out;
}

/**
 * Folds `added` into `existing` as one more alternative, or null if they are
 * not the same kind of thing.
 *
 * Refusing is the important half. Two picks only alternate when they are the
 * same call on the same chain - `s("bd")` and `s("sd")` are two sounds for one
 * part, while `s("bd")` and `n("0 2")` are a drum and a melody, and merging
 * those would produce a part that is silent every other cycle.
 */
export function alternateWith(existing, added) {
  const a = splitChain(existing);
  const b = splitChain(added);
  const headA = headCall(a.head);
  const headB = headCall(b.head);
  if (!headA || !headB || headA.fn !== headB.fn) return null;
  // The chain has to match too: the tail is the sound design, and quietly
  // dropping the added entry's own chain would make the pick a lie.
  if (a.tail.join('\n').trim() !== b.tail.join('\n').trim()) return null;

  const words = [...alternatives(headA.arg), ...alternatives(headB.arg)];
  return [`${headA.label}${headA.fn}("<${words.join(' ')}>")`, ...a.tail].join('\n');
}

/** Hangs a `.method()` fragment off the last real line of a block. */
export function chainOnto(blockText, fragment) {
  const lines = blockText.replace(/\r/g, '').split('\n');
  let target = lines.length - 1;
  while (target > 0 && (lines[target].trim() === '' || lines[target].trim().startsWith('//'))) {
    target -= 1;
  }
  lines[target] = lines[target].trimEnd() + fragment.trim();
  return lines.join('\n');
}

/**
 * One more pick added to the block being built.
 *
 * Three outcomes, in the order they are tried: a fragment chains on, a
 * matching pattern alternates, and anything else replaces nothing - it is
 * returned as a SEPARATE block, because a melody and a drum part are two
 * parts however they were picked.
 */
export function addToBlock(blockText, added) {
  const kind = classifyItem(added);
  if (kind === 'empty') return { text: blockText, separate: false };
  if (kind === 'fragment') return { text: chainOnto(blockText, added), separate: false };
  const merged = alternateWith(blockText, added);
  if (merged) return { text: merged, separate: false };
  return { text: added.trim(), separate: true };
}

/**
 * Where a setup statement goes: after any setup already at the top, and before
 * the first block that plays something.
 *
 * Returned as a line index so the caller can splice it into the document it
 * already holds, rather than being handed a rebuilt document to diff.
 */
export function setupLine(lines) {
  let at = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('//')) continue;
    if (SETUP.test(trimmed)) at = i + 1;
    else break;
  }
  return at;
}
