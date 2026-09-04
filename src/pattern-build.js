/**
 * Stepping a melodic pattern in on the clip grid.
 *
 * The grid is read as a piano roll turned on its side. Eight columns are the
 * eight eighth-notes of a bar; the row above each doubles it to sixteenths;
 * the top two rows are the scale, with the second row acting as the black keys.
 * Nothing here knows about MIDI - it is the model the pads write into and the
 * mini-notation that comes out.
 *
 *   row 1   scale degree 1-8
 *   row 2   held with the pad above: that degree a semitone higher
 *   row 3   how many cycles the pattern repeats
 *   row 4   the sixteenth after the eighth below it
 *   row 5   the eight eighth-notes of the bar
 *
 * Three mini-notation forms carry the whole thing, and all three were checked
 * against the running engine rather than assumed:
 *
 *   `1#`  raises a SCALE DEGREE by a semitone - `n("0 1# 2").scale("c4:major")`
 *         sounds C4 Eb4 E4, so the sharp is chromatic and not "the next degree"
 *   `_`   holds the previous note through this step, which is what makes
 *         "note lengths hold until the next note" the default rather than a
 *         setting
 *   `~`   is a real rest, and is the only way to get silence - which is why it
 *         needs a deliberate press rather than just leaving a step empty
 */

/** Eight columns of eighth-notes, each splittable into two sixteenths. */
export const COLUMNS = 8;
export const STEPS = COLUMNS * 2;

/** The octave TC 1 sweeps. Below 3 a scale is mud; above 9 it is out of hearing. */
export const OCTAVE_RANGE = { min: 3, max: 9 };

/** A pattern segment: sixteen steps and how many cycles it lasts. */
export function createSegment(repeats = 1) {
  return { steps: Array(STEPS).fill(null), repeats };
}

export function createPattern({ key = 'c', mode = 'major', octave = 4 } = {}) {
  return { key, mode, octave, segments: [createSegment()], active: 0 };
}

/**
 * The step index a pad pair addresses.
 *
 * The bottom row alone is an eighth; the same column's row above it is the
 * sixteenth AFTER that eighth, which is why it is `+ 1` and not a row of its
 * own. Returns null for a column outside the grid rather than clamping - a
 * pad that is not there addressed the eighth column silently.
 */
export function stepIndex(column, upper = false) {
  if (column < 0 || column >= COLUMNS) return null;
  return column * 2 + (upper ? 1 : 0);
}

/** The active segment of a pattern. */
const current = (pattern) => pattern.segments[pattern.active];

/**
 * Write a note into a step. `degree` is 0-based (pad 1 is degree 0).
 *
 * Writing over a step replaces it: the pads are a score, not a log, and
 * pressing the same step twice with different degrees has to mean the second
 * one rather than a chord nobody asked for.
 */
export function setStep(pattern, index, { degree, sharp = false }) {
  const segment = current(pattern);
  if (index === null || index < 0 || index >= STEPS) return pattern;
  segment.steps[index] = { degree, sharp };
  return pattern;
}

/** Write a rest. Deliberate, because an untouched step HOLDS rather than rests. */
export function setRest(pattern, index) {
  const segment = current(pattern);
  if (index === null || index < 0 || index >= STEPS) return pattern;
  segment.steps[index] = 'rest';
  return pattern;
}

/** How many cycles the active segment lasts, 1-8. */
export function setRepeats(pattern, repeats) {
  current(pattern).repeats = Math.min(Math.max(repeats, 1), COLUMNS);
  return pattern;
}

/**
 * Duplicate the active segment so the copy plays after it.
 *
 * `empty` gives a blank segment of the SAME length instead - room left in the
 * arrangement, which is a different thing from a copy and is what a second
 * press of the same button should mean.
 */
export function addSegment(pattern, { empty = false } = {}) {
  const source = current(pattern);
  const next = empty
    ? createSegment(source.repeats)
    : { steps: [...source.steps], repeats: source.repeats };
  pattern.segments.splice(pattern.active + 1, 0, next);
  pattern.active += 1;
  return pattern;
}

/**
 * Blank the active segment, keeping its length.
 *
 * This is the second half of the SCENE 3 gesture. A double press cannot be
 * recognised until the second press arrives, by which time the first has
 * already duplicated the segment - so the second press converts that
 * duplicate rather than adding another, and one gesture produces one segment
 * either way.
 */
export function makeActiveEmpty(pattern) {
  pattern.segments[pattern.active].steps = Array(STEPS).fill(null);
  return pattern;
}

/** One step as mini-notation. */
function stepText(step) {
  if (step === null) return '_'; // held: the note before it is still sounding
  if (step === 'rest') return '~';
  return `${step.degree}${step.sharp ? '#' : ''}`;
}

/**
 * One segment's sixteen steps.
 *
 * A leading held step has nothing to hold, so it becomes a rest - `_` at the
 * top of a cycle is a note continuing from a note that was never played, and
 * Strudel has no reason to guess what it should sound.
 */
export function renderSegment(segment) {
  const steps = [...segment.steps];
  for (let i = 0; i < steps.length && steps[i] === null; i += 1) steps[i] = 'rest';
  return steps.map(stepText).join(' ');
}

/**
 * The whole pattern as one mini-notation string.
 *
 * Segments live inside `<>` so each takes a turn by the cycle, and `!n` gives
 * one its repeat count - so "this bar three times, then that bar twice" is
 * `<[...]!3 [...]!2>` rather than an arrangement built somewhere else.
 * A single segment repeating once needs neither, and says so.
 */
export function renderPattern(pattern) {
  const parts = pattern.segments.map((segment) => {
    const body = renderSegment(segment);
    return segment.repeats > 1 ? `[${body}]!${segment.repeats}` : `[${body}]`;
  });
  if (parts.length === 1 && pattern.segments[0].repeats === 1) {
    return renderSegment(pattern.segments[0]);
  }
  return `<${parts.join(' ')}>`;
}

/**
 * The block this pattern writes.
 *
 * The scale is appended rather than offered, because every degree in the
 * pattern is meaningless without it - a bare `n("0 2 4")` is not a key-less
 * melody, it is a melody in whatever key the last person set.
 */
export function patternBlock(pattern) {
  return `$: n("${renderPattern(pattern)}")\n  .scale("${pattern.key}${pattern.octave}:${pattern.mode}")`;
}

/** `0`, `1#`, `~`, `_` -> the step it represents. */
function parseStep(word) {
  if (word === '~') return 'rest';
  if (word === '_') return null;
  const match = /^(\d+)(#?)$/.exec(word);
  return match ? { degree: Number(match[1]), sharp: match[2] === '#' } : 'rest';
}

/**
 * Read a block this mode wrote back into a pattern, or null.
 *
 * Without this, entering the mode on a pattern you stepped in earlier would
 * replace it with an empty bar - editing in place would mean "in place of".
 * A block that is NOT one of ours returns null and is left to the caller,
 * which is the honest answer: this cannot round-trip hand-written Strudel and
 * should not pretend to.
 */
export function parsePattern(text) {
  const scale = /\.scale\(\s*"([a-gA-G][#b]?)(\d)\s*:\s*([a-z]+)"\s*\)/.exec(text ?? '');
  const notes = /\bn\(\s*"([^"]*)"\s*\)/.exec(text ?? '');
  if (!scale || !notes) return null;

  const pattern = createPattern({
    key: scale[1].toLowerCase(),
    mode: scale[3],
    octave: Number(scale[2]),
  });

  const body = notes[1].trim();
  // `<[...]!3 [...]!2>` is several segments; a bare run of words is one.
  const alternation = /^<(.*)>$/s.exec(body);
  const chunks = alternation
    ? [...alternation[1].matchAll(/\[([^\]]*)\](?:!(\d+))?/g)].map((m) => ({
        words: m[1].trim().split(/\s+/),
        repeats: Number(m[2] ?? 1),
      }))
    : [{ words: body.split(/\s+/), repeats: 1 }];
  if (chunks.length === 0) return null;

  pattern.segments = chunks.map(({ words, repeats }) => {
    const segment = createSegment(Math.min(Math.max(repeats, 1), COLUMNS));
    for (let i = 0; i < STEPS; i += 1) {
      segment.steps[i] = words[i] === undefined ? 'rest' : parseStep(words[i]);
    }
    return segment;
  });
  pattern.active = pattern.segments.length - 1;
  return pattern;
}

/** Clamp an octave into the range TC 1 sweeps. */
export function setOctave(pattern, octave) {
  pattern.octave = Math.min(Math.max(Math.round(octave), OCTAVE_RANGE.min), OCTAVE_RANGE.max);
  return pattern;
}

/**
 * Which of the eight degrees have an ACCIDENTAL above them - the pads row 2
 * should light.
 *
 * A semitone above degree 3 of a major scale is degree 4, not an accidental,
 * so that pad would do nothing and must not invite a press. Computed from the
 * scale's own step sizes rather than hard-coded to major, so a mode with a
 * different shape lights a different set - which is the entire use of the
 * display.
 */
const STEPS_BY_MODE = {
  major: [2, 2, 1, 2, 2, 2, 1],
  minor: [2, 1, 2, 2, 1, 2, 2],
  dorian: [2, 1, 2, 2, 2, 1, 2],
  phrygian: [1, 2, 2, 2, 1, 2, 2],
  lydian: [2, 2, 2, 1, 2, 2, 1],
  mixolydian: [2, 2, 1, 2, 2, 1, 2],
  locrian: [1, 2, 2, 1, 2, 2, 2],
};

export function accidentalDegrees(mode = 'major') {
  const steps = STEPS_BY_MODE[mode] ?? STEPS_BY_MODE.major;
  // A whole tone to the next degree leaves a semitone in between that the
  // scale does not contain; a semitone leaves nothing.
  return steps.map((gap, degree) => (gap === 2 ? degree : null)).filter((d) => d !== null);
}
