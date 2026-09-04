import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  OCTAVE_RANGE,
  STEPS,
  accidentalDegrees,
  addSegment,
  createPattern,
  makeActiveEmpty,
  parsePattern,
  patternBlock,
  renderPattern,
  renderSegment,
  setOctave,
  setRepeats,
  setRest,
  setStep,
  stepIndex,
} from '../src/pattern-build.js';

describe('stepIndex', () => {
  it('reads the bottom row as the eight eighth-notes', () => {
    expect(stepIndex(0)).toBe(0);
    expect(stepIndex(7)).toBe(14);
  });

  it('reads the row above as the sixteenth AFTER that eighth', () => {
    expect(stepIndex(0, true)).toBe(1);
    expect(stepIndex(3, true)).toBe(7);
  });

  it('refuses a column off the grid rather than clamping to the last one', () => {
    expect(stepIndex(8)).toBeNull();
    expect(stepIndex(-1)).toBeNull();
  });
});

describe('steps', () => {
  it('holds an untouched step instead of resting it', () => {
    // "All note lengths hold until the next note" - so the DEFAULT is a hold,
    // and silence is the thing that takes a deliberate press.
    const p = createPattern();
    setStep(p, 0, { degree: 0 });
    setStep(p, 4, { degree: 2 });
    expect(renderSegment(p.segments[0])).toBe('0 _ _ _ 2 _ _ _ _ _ _ _ _ _ _ _');
  });

  it('rests only where asked', () => {
    const p = createPattern();
    setStep(p, 0, { degree: 0 });
    setRest(p, 1);
    expect(renderSegment(p.segments[0]).startsWith('0 ~ _')).toBe(true);
  });

  it('marks a sharpened degree chromatically', () => {
    // Checked against the engine: n("0 1# 2").scale("c4:major") is C4 Eb4 E4.
    const p = createPattern();
    setStep(p, 0, { degree: 1, sharp: true });
    expect(renderSegment(p.segments[0]).startsWith('1#')).toBe(true);
  });

  it('replaces a step rather than stacking a chord on it', () => {
    const p = createPattern();
    setStep(p, 0, { degree: 0 });
    setStep(p, 0, { degree: 5 });
    expect(renderSegment(p.segments[0]).startsWith('5 ')).toBe(true);
  });

  it('rests a leading hold, which has nothing to hold', () => {
    const p = createPattern();
    setStep(p, 8, { degree: 3 });
    const out = renderSegment(p.segments[0]).split(' ');
    expect(out.slice(0, 8)).toEqual(Array(8).fill('~'));
    expect(out[8]).toBe('3');
  });

  it('ignores a step off the end', () => {
    const p = createPattern();
    expect(() => setStep(p, STEPS, { degree: 0 })).not.toThrow();
    expect(renderSegment(p.segments[0])).toBe(Array(STEPS).fill('~').join(' '));
  });
});

describe('segments', () => {
  it('needs no brackets for one bar playing once', () => {
    const p = createPattern();
    setStep(p, 0, { degree: 0 });
    expect(renderPattern(p)).not.toContain('<');
  });

  it('gives a repeat count with !n', () => {
    const p = createPattern();
    setStep(p, 0, { degree: 0 });
    setRepeats(p, 3);
    expect(renderPattern(p)).toMatch(/^<\[.*\]!3>$/);
  });

  it('clamps repeats to the eight pads that set them', () => {
    const p = createPattern();
    setRepeats(p, 99);
    expect(p.segments[0].repeats).toBe(COLUMNS);
    setRepeats(p, 0);
    expect(p.segments[0].repeats).toBe(1);
  });

  it('duplicates the active segment to play after it', () => {
    const p = createPattern();
    setStep(p, 0, { degree: 4 });
    setRepeats(p, 2);
    addSegment(p);
    expect(p.segments).toHaveLength(2);
    expect(p.active).toBe(1);
    // A copy, and the copy is what is now being edited.
    expect(renderSegment(p.segments[1])).toBe(renderSegment(p.segments[0]));
    expect(renderPattern(p)).toBe(`<[${renderSegment(p.segments[0])}]!2 [${renderSegment(p.segments[1])}]!2>`);
  });

  it('converts the duplicate to empty on the second press, not add a third', () => {
    // The double press is only knowable once the second lands, by which time
    // the first has already duplicated. One gesture must still be one segment.
    const p = createPattern();
    setStep(p, 0, { degree: 4 });
    setRepeats(p, 3);
    addSegment(p);
    makeActiveEmpty(p);
    expect(p.segments).toHaveLength(2);
    expect(p.segments[1].repeats).toBe(3);
    expect(renderSegment(p.segments[1])).toBe(Array(STEPS).fill('~').join(' '));
  });
});

describe('octave', () => {
  it('stays inside the range TC 1 sweeps', () => {
    const p = createPattern();
    expect(setOctave(p, 1).octave).toBe(OCTAVE_RANGE.min);
    expect(setOctave(p, 99).octave).toBe(OCTAVE_RANGE.max);
    expect(setOctave(p, 5).octave).toBe(5);
  });
});

describe('accidentalDegrees', () => {
  it('lights only where a semitone up is OUTSIDE the scale', () => {
    // Major: a semitone above degree 2 (E) is F, which IS degree 3 - so that
    // pad would do nothing and must stay dark. Same for degree 6 (B -> C).
    expect(accidentalDegrees('major')).toEqual([0, 1, 3, 4, 5]);
  });

  it('lights a different set for a different mode', () => {
    expect(accidentalDegrees('phrygian')).toEqual([1, 2, 3, 5, 6]);
  });

  it('falls back to major for a mode it does not know', () => {
    expect(accidentalDegrees('bebop-nonsense')).toEqual(accidentalDegrees('major'));
  });
});

describe('patternBlock', () => {
  it('always declares the key, because a degree means nothing without it', () => {
    const p = createPattern({ key: 'd', mode: 'minor', octave: 3 });
    setStep(p, 0, { degree: 0 });
    const block = patternBlock(p);
    expect(block).toContain('.scale("d3:minor")');
    expect(block.startsWith('$: n("')).toBe(true);
  });
});

describe('parsePattern', () => {
  it('round-trips a block this mode wrote', () => {
    // Editing in place must not mean "in place of": re-entering the mode has
    // to continue the pattern, not replace it with an empty bar.
    const p = createPattern({ key: 'd', mode: 'minor', octave: 3 });
    setStep(p, 0, { degree: 0 });
    setStep(p, 1, { degree: 4, sharp: true });
    setRest(p, 2);
    setRepeats(p, 3);
    addSegment(p);
    const back = parsePattern(patternBlock(p));
    expect(patternBlock(back)).toBe(patternBlock(p));
  });

  it('recovers the key, mode and octave', () => {
    const back = parsePattern(['$: n("0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _")', '  .scale("f5:lydian")'].join(String.fromCharCode(10)));
    expect(back).toMatchObject({ key: 'f', mode: 'lydian', octave: 5 });
  });

  it('reads a single unbracketed segment', () => {
    const back = parsePattern('$: n("3 ~ _ _ _ _ _ _ _ _ _ _ _ _ _ _").scale("c4:major")');
    expect(back.segments).toHaveLength(1);
    expect(renderSegment(back.segments[0]).startsWith('3 ~ _')).toBe(true);
  });

  it('refuses a block it did not write, rather than half-reading it', () => {
    expect(parsePattern('$: s("bd sd").gain(1)')).toBeNull();
    expect(parsePattern('$: n("0 2 4")')).toBeNull(); // no scale: no key
    expect(parsePattern('')).toBeNull();
  });

  it('pads a short pattern out to sixteen steps', () => {
    const back = parsePattern('$: n("0 2").scale("c4:major")');
    expect(renderSegment(back.segments[0]).split(' ')).toHaveLength(16);
  });
});
