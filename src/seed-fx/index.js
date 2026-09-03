import * as filter from './filter.js';
import * as space from './space.js';
import * as time from './time.js';
import * as drive from './drive.js';
import * as pitch from './pitch.js';
import * as motion from './motion.js';
import * as envelope from './envelope.js';
import * as rhythm from './rhythm.js';
import * as structure from './structure.js';
import * as chance from './chance.js';
import * as sequence from './sequence.js';
import * as mix from './mix.js';

/**
 * The FX library, in the order the right-hand category knob scrolls through
 * it.
 *
 * The order is a performance decision, not an alphabetical one: it runs from
 * the effects that colour a sound (filter, space, time, drive) through the
 * ones that move it (pitch, motion, envelope) to the ones that rearrange it
 * (rhythm, structure, chance, sequence), ending at level. Reaching for a
 * filter is the commonest thing anyone does mid-set, so it is first, at the
 * bottom of the knob's travel where the hand lands without looking.
 */
const MODULES = [
  filter,
  space,
  time,
  drive,
  pitch,
  motion,
  envelope,
  rhythm,
  structure,
  chance,
  sequence,
  mix,
];

export const FX_CATEGORIES = MODULES.map((m) => ({
  name: m.category,
  entries: m.entries,
}));

/** Flat list, for searching and for the library panel. */
export const ALL_FX = FX_CATEGORIES.flatMap((cat) =>
  cat.entries.map((entry) => ({ ...entry, category: cat.name })),
);
