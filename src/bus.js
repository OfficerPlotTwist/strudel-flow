/**
 * The reverb bus: the one place a song says how big its reverb is.
 *
 * There is exactly one of these per song because there is exactly one reverb
 * per orbit, and superdough's own source says what happens if you pretend
 * otherwise - two blocks on one orbit carrying different sizes regenerate the
 * convolver's impulse response on every event:
 *
 *     // avoids endless regeneration on things like
 *     //   stack(s("a"), s("b").rsize(8)).room(.5)
 *
 * So `roomsize` is not a per-block control and is not offered as one. It lives
 * here, and every block's `.room()` send feeds the reverb this statement
 * describes. Send on the channel, size on the bus - the same split a mixing
 * desk makes, for the same reason.
 *
 * One orbit for the whole song, likewise. Each orbit instantiates its own
 * summing node, delay and convolver, and convolution is the expensive one;
 * sharing means one reverb rather than one per part. It also makes the
 * disagreement above impossible to express, which is a better guarantee than
 * remembering not to. The cue is the deliberate exception - see monitor.js,
 * where a separate orbit is exactly the point.
 */

/** Strudel's default orbit. Everything in a song shares it. */
export const SONG_ORBIT = 1;

/** The bus statement, with the size a song starts at. */
export const busBlock = (size = 2) => `// reverb bus
all(x => x.roomsize(${size}).orbit(${SONG_ORBIT}))`;

/**
 * Recognised by the `roomsize` call, not by the comment above it - a bus that
 * stopped being the bus because someone renamed the comment would be a trap.
 */
const BUS_MARK = /\broomsize\s*\(\s*(-?(?:\d+\.?\d*|\.\d+))\s*\)/;

/** Whether the song already has a reverb bus. */
export function hasBus(code) {
  return BUS_MARK.test(code ?? '');
}

/** The bus's current size, or null when there is no bus. */
export function busSize(code) {
  const match = BUS_MARK.exec(code ?? '');
  return match ? Number(match[1]) : null;
}

/**
 * Where the bus's size lives in `code`, as `{ from, to, text }`, or null.
 *
 * Offsets rather than a rewritten document, so the knob can replace four
 * characters and leave every other position in the file exactly where the
 * editor's selection and mini-notation highlights expect them.
 */
export function busSizeSpan(code) {
  const match = BUS_MARK.exec(code ?? '');
  if (!match) return null;
  const at = match.index + match[0].indexOf(match[1]);
  return { from: at, to: at + match[1].length, text: match[1] };
}

/**
 * The calls the bus is allowed to carry. Anything else got there by accident.
 *
 * `all` applies its function to EVERY pattern in the song, so a call chained
 * onto it is a master control nobody asked for - and the ones the knobs write
 * are exactly the ones that silence a song outright. Measured against the
 * engine: `.postgain(0)` puts `postgain: 0` on every event, `.lpf(20)` puts a
 * 20 Hz cutoff on every event. Both leave a song that looks completely normal
 * and makes no sound.
 */
const BUS_ALLOWED = new Set(['all', 'roomsize', 'orbit']);

/**
 * Calls on the bus statement that do not belong there, by name.
 *
 * For songs written before the knobs learned to refuse the bus: the cursor
 * starts on it in an empty sheet, every master control was virtual there, and
 * one knob turn appended `.adsr(...)` or `.postgain(...)` to `all(...)`. This
 * only REPORTS them - a saved song is the user's, and a silent song is a
 * better outcome than an app that edits one on load without being asked.
 */
export function busStrays(code) {
  const NEWLINE = String.fromCharCode(10);
  const text = code ?? '';
  const line = text.split(NEWLINE).find((l) => BUS_MARK.test(l));
  if (!line) return [];
  const CALL = /([A-Za-z_$][\w$]*)\s*\(/g;
  const names = [...line.matchAll(CALL)].map((m) => m[1]);
  return [...new Set(names.filter((name) => !BUS_ALLOWED.has(name)))];
}

/**
 * The song with a reverb bus appended if it had none.
 *
 * At the end, like a desk's master strip: it applies to everything above it,
 * and putting it first would push the music the performer is reading off the
 * top of the screen.
 */
export function ensureBus(code, size = 2) {
  const text = code ?? '';
  if (hasBus(text)) return text;
  if (!text.trim()) return busBlock(size);
  return `${text.replace(/\s+$/, '')}\n\n${busBlock(size)}`;
}
