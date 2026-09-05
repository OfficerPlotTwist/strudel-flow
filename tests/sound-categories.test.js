import { describe, expect, it } from 'vitest';
import { SOUND_CATEGORIES, groupSounds, soundCategory } from '../src/sound-categories.js';

/** The registry reports `{ name, type }`; only samples need the name rules. */
const sample = (name) => ({ name, type: 'sample' });

describe('sound categories', () => {
  it('offers twelve and no more', () => {
    // The cap is the point: the control surface steps categories with a knob,
    // and a list of thirty headings is the flat list again with extra turns.
    expect(SOUND_CATEGORIES).toHaveLength(12);
    expect(new Set(SOUND_CATEGORIES).size).toBe(12);
  });

  it('reads a kit name by its last segment', () => {
    // `<kit>_<piece>` is eighty percent of the registry.
    expect(soundCategory('linndrum_sd', 'sample')).toBe('snare');
    expect(soundCategory('mc303_hh', 'sample')).toBe('hats');
    expect(soundCategory('akaixr10_bd', 'sample')).toBe('kick');
    expect(soundCategory('ry30_lt', 'sample')).toBe('toms');
    expect(soundCategory('korgm1_cr', 'sample')).toBe('cymbals');
  });

  it('reads a piece-led name by its first segment', () => {
    // The other convention in the same registry: the piece leads and a
    // register follows. Both have to work or a bank lands in `unsorted`.
    expect(soundCategory('snare_hi', 'sample')).toBe('snare');
    expect(soundCategory('snare_modern', 'sample')).toBe('snare');
    expect(soundCategory('tom_mallet', 'sample')).toBe('toms');
    expect(soundCategory('shaker_large', 'sample')).toBe('hats');
  });

  it('sees through articulations and copy numbers', () => {
    expect(soundCategory('recorder_alto_sus', 'sample')).toBe('melodic');
    expect(soundCategory('xylophone_hard_ff', 'sample')).toBe('melodic');
    expect(soundCategory('kalimba3', 'sample')).toBe('melodic');
    expect(soundCategory('tambourine2', 'sample')).toBe('claps & perc');
    // But a digit that is part of the NAME is not a copy number. `super64` is
    // a harmonica; stripping gives `super`, which is nothing at all.
    expect(soundCategory('super64', 'sample')).toBe('melodic');
    expect(soundCategory('super64_vib', 'sample')).toBe('melodic');
  });

  it('takes soundfonts and synths from the registry, not the spelling', () => {
    // superdough already knows what these are, so the name rules never have to.
    expect(soundCategory('gm_pad_warm', 'soundfont')).toBe('soundfonts');
    expect(soundCategory('anything', 'soundfont')).toBe('soundfonts');
    expect(soundCategory('sawtooth', 'synth')).toBe('synths');
  });

  it('refuses the entries that are not sounds', () => {
    // `_base` is the URL a sample map was loaded from, recorded in the same
    // registry. `s("_base")` plays nothing - a silent dead pick.
    expect(soundCategory('_base', 'sample')).toBe(null);
    expect(soundCategory('', 'sample')).toBe(null);
  });

  it('groups in a fixed order and drops empty sections', () => {
    const grouped = groupSounds([sample('linndrum_sd'), sample('mc303_bd'), sample('kalimba')]);
    expect(grouped.map(([c]) => c)).toEqual(['kick', 'snare', 'melodic']);
    expect(grouped.find(([c]) => c === 'kick')[1]).toHaveLength(1);
  });

  it('never loses an entry it did not explicitly refuse', () => {
    const names = ['linndrum_sd', 'gm_pad_warm', 'wildly_unknown_thing', '_base'];
    const entries = names.map(sample);
    const kept = groupSounds(entries).reduce((n, [, g]) => n + g.length, 0);
    const refused = entries.filter((e) => soundCategory(e.name, e.type) === null).length;
    expect(kept + refused).toBe(entries.length);
    // The unknown one is visible in `unsorted`, not silently dropped.
    expect(soundCategory('wildly_unknown_thing', 'sample')).toBe('unsorted');
  });
});
