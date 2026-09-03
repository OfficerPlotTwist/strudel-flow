import { describe, expect, it } from 'vitest';
import { MODES, degreeToMidi, patternToDegrees, pitchToMidi, toDegrees } from '../src/degrees.js';

/**
 * Splits a mini-notation body into its value tokens, skipping the operands of
 * `*2` / `!3` / `@1.5` / `:2` the same way the module does, so the helper below
 * compares pitches to degrees and never a repeat count to a pitch.
 */
function valueTokens(src) {
  const parts = src.split(/([^A-Za-z0-9#.-]+)/);
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const before = i > 0 ? parts[i - 1] : '';
    if (parts[i] !== '' && !/[*!@/%:]\s*$/.test(before)) out.push(parts[i]);
  }
  return out;
}

/** Resolves `n("...").scale("root:mode")` back to the MIDI numbers it plays. */
function resolve(code) {
  const m = /n\("([^"]*)"\)\.scale\("([^":]*):([^"]*)"\)/.exec(code);
  expect(m, `expected an n(...).scale(...) call in ${code}`).not.toBeNull();
  const [, degrees, root, mode] = m;
  const rootMidi = pitchToMidi(root);
  expect(rootMidi).not.toBeNull();
  expect(MODES[mode]).toBeDefined();
  return valueTokens(degrees).map((t) => degreeToMidi(rootMidi, mode, Number(t)));
}

/** The MIDI numbers the original `note("...")` call plays. */
function originalMidi(code) {
  const body = /note\("([^"]*)"\)/.exec(code)[1];
  return valueTokens(body).map((t) => pitchToMidi(t));
}

const ROUND_TRIP = [
  'note("<[c3,eb3,g3] [ab2,c3,eb3]>")',
  'note("e1 ~ e1 e1 ~ g1 ~ d1")',
  'note("<f5 ~ ~ ab5> <c6 ~ bb5 ab5>")',
  'note("c4 c5 eb4 eb5 g4 g5 bb4 bb5")',
  'note("c3*2 eb3")',
  'note("c4 c#4 d4 d#4 e4")',
  'note("c3 eb3!3 g3@1.5")',
];

describe('pitchToMidi', () => {
  it('reads letter, accidentals and octave', () => {
    expect(pitchToMidi('c3')).toBe(48);
    expect(pitchToMidi('eb3')).toBe(51);
    expect(pitchToMidi('c#4')).toBe(61);
    expect(pitchToMidi('ab2')).toBe(44);
  });

  it('defaults to octave 5, like Strudel', () => {
    expect(pitchToMidi('c')).toBe(pitchToMidi('c5'));
  });

  it('returns null for anything that is not a note name', () => {
    expect(pitchToMidi('3')).toBeNull();
    expect(pitchToMidi('~')).toBeNull();
    expect(pitchToMidi('bd')).toBeNull();
    expect(pitchToMidi('')).toBeNull();
  });
});

describe('degreeToMidi', () => {
  it('walks the mode table from the root', () => {
    expect(degreeToMidi(48, 'minor', 0)).toBe(48);
    expect(degreeToMidi(48, 'minor', 2)).toBe(51);
    expect(degreeToMidi(48, 'minor', 7)).toBe(60);
  });

  it('floors negative degrees instead of truncating them', () => {
    expect(degreeToMidi(48, 'minor', -2)).toBe(44);
    expect(degreeToMidi(48, 'minor', -7)).toBe(36);
    expect(degreeToMidi(48, 'major', -1)).toBe(47);
  });
});

describe('toDegrees round-trip', () => {
  for (const code of ROUND_TRIP) {
    it(`reproduces every note of ${code}`, () => {
      const result = toDegrees(code);
      expect(result.changed).toBe(true);
      expect(resolve(result.code)).toEqual(originalMidi(code));
    });
  }

  it('proves the same thing through patternToDegrees directly', () => {
    const { degrees, scale } = patternToDegrees('c3 eb3 g3 bb3');
    const [root, mode] = scale.split(':');
    const midi = valueTokens(degrees).map((d) => degreeToMidi(pitchToMidi(root), mode, Number(d)));
    expect(midi).toEqual([48, 51, 55, 58]);
  });
});

describe('toDegrees refusals', () => {
  it('skips a pattern containing a bare number, which may already be MIDI', () => {
    const code = 'note("3 5")';
    const result = toDegrees(code);
    expect(result.code).toBe(code);
    expect(result.changed).toBe(false);
    expect(result.converted).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips a pattern that mixes note names with a bare number', () => {
    const code = 'note("c3 3 g3")';
    expect(toDegrees(code).code).toBe(code);
    expect(toDegrees(code).skipped).toBe(1);
  });

  for (const code of ['note(12)', 'note(0.15)', 'note(-.11)']) {
    it(`never even matches the numeric argument in ${code}`, () => {
      const result = toDegrees(code);
      expect(result.code).toBe(code);
      expect(result.changed).toBe(false);
      expect(result.converted).toBe(0);
      expect(result.skipped).toBe(0);
    });
  }

  it('leaves code with no note() call alone', () => {
    for (const code of ['s("bd*4")', 'sound("hh").gain(0.4)', '// nothing here']) {
      const result = toDegrees(code);
      expect(result.code).toBe(code);
      expect(result.changed).toBe(false);
      expect(result.converted).toBe(0);
      expect(result.skipped).toBe(0);
    }
  });

  it('returns null from patternToDegrees for an empty or unparseable body', () => {
    expect(patternToDegrees('')).toBeNull();
    expect(patternToDegrees('~ ~')).toBeNull();
    expect(patternToDegrees('bd sd')).toBeNull();
  });
});

describe('structure is preserved', () => {
  it('keeps an operator operand out of the pitch stream', () => {
    expect(toDegrees('note("c3*2 eb3")').code).toBe('n("0*2 2").scale("c3:minor")');
  });

  it('keeps rests, alternation, chords and stacking', () => {
    expect(toDegrees('note("<[c3,eb3,g3] [ab2,c3,eb3]>")').code)
      .toBe('n("<[2,4,6] [0,2,4]>").scale("ab2:major")');
    expect(toDegrees('note("e1 ~ e1 e1 ~ g1 ~ d1")').code)
      .toBe('n("1 ~ 1 1 ~ 3 ~ 0").scale("d1:major")');
  });

  it('keeps replicate and elongate operators', () => {
    expect(toDegrees('note("c3 eb3!3 g3@1.5")').code).toBe('n("0 2!3 4@1.5").scale("c3:minor")');
  });

  it('leaves every non-note character of the body in place', () => {
    const body = '<[c3,eb3,g3] [ab2,c3,eb3]>';
    const { degrees } = patternToDegrees(body);
    const punctuation = (s) => s.replace(/[A-Za-z0-9#]/g, '');
    expect(punctuation(degrees)).toBe(punctuation(body));
  });
});

describe('root selection', () => {
  it('roots on the lowest note, so degree 0 is the floor', () => {
    const { degrees, scale } = patternToDegrees('g3 c3 eb3');
    expect(scale.split(':')[0]).toBe('c3');
    expect(valueTokens(degrees).map(Number)).toContain(0);
  });

  it('never emits a negative degree', () => {
    for (const code of ROUND_TRIP) {
      const m = /n\("([^"]*)"\)/.exec(toDegrees(code).code);
      for (const t of valueTokens(m[1])) expect(Number(t)).toBeGreaterThanOrEqual(0);
    }
  });

  it('labels a C-minor phrase from its lowest note, ab2', () => {
    expect(patternToDegrees('<[c3,eb3,g3] [ab2,c3,eb3]>').scale).toBe('ab2:major');
  });
});

describe('mode selection', () => {
  it('falls back to chromatic for a run no 7-note mode holds', () => {
    expect(patternToDegrees('c4 c#4 d4 d#4 e4').scale).toBe('c4:chromatic');
  });

  it('picks an earlier 7-note mode for a diatonic pattern', () => {
    expect(patternToDegrees('c3 d3 e3 f3 g3 a3 b3').scale).toBe('c3:major');
    expect(patternToDegrees('c3 eb3 g3 bb3').scale).toBe('c3:minor');
    expect(patternToDegrees('c3 eb3 g3').scale).toBe('c3:minor');
  });
});

describe('whole snippets', () => {
  it('converts every note() call and counts them', () => {
    const result = toDegrees('note("c3 e3").gain(1)\nnote("f3 a3").room(0.2)');
    expect(result.converted).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.changed).toBe(true);
    expect(result.code).toBe('n("0 2").scale("c3:major").gain(1)\nn("0 2").scale("f3:major").room(0.2)');
  });

  it('counts converted and skipped calls separately in one snippet', () => {
    const result = toDegrees('note("c3 eb3")\nnote("3 5")');
    expect(result.converted).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.changed).toBe(true);
  });

  it('is idempotent - already-converted output is left alone', () => {
    const once = toDegrees('note("c3 eb3 g3").s("piano")');
    const twice = toDegrees(once.code);
    expect(twice.changed).toBe(false);
    expect(twice.converted).toBe(0);
    expect(twice.code).toBe(once.code);
  });
});
