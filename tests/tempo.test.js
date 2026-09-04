import { describe, expect, it } from 'vitest';
import { BPM_RANGE, clampBpm, hasTempo, setSongBpm, songBpm } from '../src/tempo.js';
import { CIRCLE_OF_FIFTHS, nextKey, setSongKey, songKey } from '../src/pattern-build.js';

describe('songBpm', () => {
  it('reads the numerator of the written form as BPM', () => {
    // `setcpm(87 / 4)` says "87 BPM, four beats to the bar" out loud.
    expect(songBpm('setcpm(87 / 4)')).toBe(87);
    expect(songBpm('setcpm(175/4)')).toBe(175);
  });

  it('reads a bare setcpm as cycles, which is bars', () => {
    expect(songBpm('setcpm(30)')).toBe(120);
  });

  it('is null when the song declares no tempo', () => {
    // Not a default: "no tempo" and "120" are different facts, and only one of
    // them is safe to write back.
    expect(songBpm('$: s("bd")')).toBeNull();
    expect(hasTempo('$: s("bd")')).toBe(false);
  });
});

describe('setSongBpm', () => {
  it('keeps the form the tempo was written in', () => {
    // The 4 is the time signature; collapsing it makes the tempo unreadable.
    expect(setSongBpm('setcpm(87 / 4)', 120)).toBe('setcpm(120 / 4)');
    expect(setSongBpm('setcpm(30)', 120)).toBe('setcpm(30)');
  });

  it('changes every setcpm, not just the first', () => {
    // A second one left behind would make the knob appear dead from that bar.
    const out = setSongBpm('setcpm(87 / 4)\n$: s("bd")\nsetcpm(87 / 4)', 100);
    expect(out.match(/setcpm\(100 \/ 4\)/g)).toHaveLength(2);
  });

  it('clamps to what the knob can reach', () => {
    expect(clampBpm(5)).toBe(BPM_RANGE.min);
    expect(clampBpm(9999)).toBe(BPM_RANGE.max);
    expect(setSongBpm('setcpm(87 / 4)', 9999)).toBe(`setcpm(${BPM_RANGE.max} / 4)`);
  });

  it('round-trips through songBpm', () => {
    for (const bpm of [60, 87, 140, 174]) {
      expect(songBpm(setSongBpm('setcpm(87 / 4)', bpm))).toBe(bpm);
    }
  });

  it('leaves a song with no tempo alone', () => {
    expect(setSongBpm('$: s("bd")', 120)).toBe('$: s("bd")');
  });
});

describe('circle of fifths', () => {
  it('holds twelve keys, each a fifth from the last', () => {
    expect(CIRCLE_OF_FIFTHS).toHaveLength(12);
    expect(CIRCLE_OF_FIFTHS[0]).toBe('c');
    expect(nextKey('c', 1)).toBe('g');
    expect(nextKey('g', 1)).toBe('d');
  });

  it('wraps in both directions - it is an endless encoder', () => {
    expect(nextKey('c', -1)).toBe('f');
    expect(nextKey('f', 1)).toBe('c');
    expect(nextKey('c', 12)).toBe('c');
  });

  it('starts from C for a key it does not recognise', () => {
    expect(nextKey('h', 1)).toBe('g');
    expect(nextKey(undefined, 0)).toBe('c');
  });
});

describe('setSongKey', () => {
  it('re-keys every block at once', () => {
    // Two blocks in different keys is not a modulation, it is a mistake.
    const song = '$: n("0").scale("d3:minor")\n$: n("2").scale("d5:dorian")';
    expect(setSongKey(song, 'a')).toBe('$: n("0").scale("a3:minor")\n$: n("2").scale("a5:dorian")');
  });

  it('keeps each block its own octave and mode', () => {
    // Register and mode are per-part choices; flattening them would silently
    // rewrite the arrangement.
    const out = setSongKey('.scale("c4:major") .scale("c2:lydian")', 'f#');
    expect(out).toContain('"f#4:major"');
    expect(out).toContain('"f#2:lydian"');
  });

  it('leaves a song with no key alone', () => {
    expect(setSongKey('$: s("bd")', 'a')).toBe('$: s("bd")');
  });

  it('is read back by songKey', () => {
    const out = setSongKey('$: n("0").scale("c4:major")', 'e');
    expect(songKey(out)).toEqual({ key: 'e', mode: 'major', octave: 4 });
  });
});
