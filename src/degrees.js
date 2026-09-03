/**
 * Rewrites absolute-pitch `note("c3 eb3 g3")` patterns into scale-degree
 * `n("0 2 4").scale("c3:minor")` patterns, for snippets the user already saved
 * before the library moved to degrees.
 *
 * Pure - no DOM, no localStorage, no @strudel/*. Given source text it returns
 * source text, so it is testable without a browser and reusable on an imported
 * library as easily as on a stored one.
 *
 * TWO RULES MAKE THIS SAFE TO RUN ON CODE NOBODY REVIEWED:
 *
 * 1. Every rewrite is checked before it is accepted. The emitted degrees are
 *    resolved back to MIDI with the same tables, and if any note differs from
 *    the original by even a semitone the pattern is left EXACTLY as it was.
 *    A pattern that cannot be proven identical is never touched.
 * 2. Anything ambiguous is refused rather than guessed. A bare number inside
 *    `note("...")` may be a MIDI number or a scale degree already, so a
 *    pattern containing one is skipped whole.
 *
 * The root is always the LOWEST note in the pattern, which makes every degree
 * non-negative and degree 0 the floor of the phrase. That is a readability
 * choice, not a musical claim: the mode label is whichever scale from
 * MODES contains every pitch, so a C-minor phrase whose lowest note is Ab
 * comes out as `ab2:major`. Same pitches, and the degrees stay small.
 *
 * The interval tables MUST agree with @strudel/tonal's. They are checked
 * against the real engine by scripts/verify-degrees.mjs - if that ever fails,
 * every migrated snippet is silently transposed and nothing else would notice.
 */

/** Semitones above the root, in the order .scale() indexes them. */
export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

/**
 * Tried in this order, first fit wins. `chromatic` is last and always fits, so
 * a pattern is never rejected for want of a mode - only for an unparseable
 * token. Pentatonics are deliberately absent: every pitch set that fits
 * minPent also fits `minor`, which is earlier, so they could never be chosen.
 */
const MODE_ORDER = ['major', 'minor', 'dorian', 'mixolydian', 'lydian', 'phrygian', 'locrian', 'chromatic'];

const LETTERS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** Strudel's own default when a note name carries no octave digit. */
const DEFAULT_OCTAVE = 5;
const PITCH = /^([a-gA-G])([#bs]*)(-?\d+)?$/;

/** MIDI number for a Strudel note name, or null if it is not one. */
export function pitchToMidi(token) {
  const m = PITCH.exec(token);
  if (!m) return null;
  const [, letter, accidentals, octave] = m;
  let semis = LETTERS[letter.toLowerCase()];
  for (const a of accidentals) semis += a === 'b' ? -1 : 1;
  return (Number(octave ?? DEFAULT_OCTAVE) + 1) * 12 + semis;
}

/** MIDI number a `.scale(root:mode)` pattern gives to scale degree `degree`. */
export function degreeToMidi(rootMidi, mode, degree) {
  const steps = MODES[mode];
  const octave = Math.floor(degree / steps.length);
  return rootMidi + octave * 12 + steps[degree - octave * steps.length];
}

/** The note name .scale() wants for a MIDI number. Flats, to match the corpus. */
const SPELLING = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];
function midiToScaleRoot(midi) {
  return `${SPELLING[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * Splits a mini-notation string into slots that hold a note and the separators
 * between them, so a rewrite can replace notes without disturbing rhythm.
 *
 * An alphanumeric run is a NOTE slot unless the separator right before it is an
 * operator (`*2`, `!3`, `@1.5`, `:2`) - those operands are counts, not pitches.
 */
function slots(src) {
  const parts = src.split(/([^A-Za-z0-9#.-]+)/);
  const out = [];
  for (let i = 0; i < parts.length; i += 1) {
    const isAtom = i % 2 === 0;
    const before = i > 0 ? parts[i - 1] : '';
    out.push({
      text: parts[i],
      isNote: isAtom && parts[i] !== '' && !/[*!@/%:]\s*$/.test(before),
    });
  }
  return out;
}

/**
 * Converts one `note("...")` body to `{ degrees, scale }`, or null if it must
 * be left alone. Null is the safe answer and is returned for anything with a
 * token that is not a note name - a bare number most of all, since `note("3")`
 * is a MIDI number and rewriting it as degree 3 would transpose it.
 */
export function patternToDegrees(src) {
  const parsed = slots(src);
  const notes = parsed.filter((s) => s.isNote);
  if (!notes.length) return null;

  const midi = [];
  for (const slot of notes) {
    const value = pitchToMidi(slot.text);
    if (value === null) return null;
    midi.push(value);
    slot.midi = value;
  }

  const rootMidi = Math.min(...midi);
  const mode = MODE_ORDER.find((name) => {
    const steps = new Set(MODES[name]);
    return midi.every((v) => steps.has((v - rootMidi) % 12));
  });
  if (!mode) return null;

  const steps = MODES[mode];
  for (const slot of notes) {
    const rel = slot.midi - rootMidi;
    slot.degree = Math.floor(rel / 12) * steps.length + steps.indexOf(rel % 12);
    // Rule 1: prove it, or refuse it.
    if (degreeToMidi(rootMidi, mode, slot.degree) !== slot.midi) return null;
  }

  return {
    degrees: parsed.map((s) => (s.isNote ? String(s.degree) : s.text)).join(''),
    scale: `${midiToScaleRoot(rootMidi)}:${mode}`,
  };
}

/** `note("...")` with a STRING argument. `note(12)` is a semitone offset and
 *  has no degree form, so the quotes are required and it is never matched. */
const NOTE_CALL = /\bnote\("([^"]*)"\)/g;

/**
 * Rewrites every convertible `note("...")` in a snippet's source.
 *
 * Returns the new code plus counts, and `changed: false` when nothing was
 * converted - callers use that to leave the entry, and the library, untouched.
 */
export function toDegrees(code) {
  let converted = 0;
  let skipped = 0;
  const next = code.replace(NOTE_CALL, (whole, body) => {
    const result = patternToDegrees(body);
    if (!result) {
      skipped += 1;
      return whole;
    }
    converted += 1;
    return `n("${result.degrees}").scale("${result.scale}")`;
  });
  return { code: next, changed: converted > 0, converted, skipped };
}
