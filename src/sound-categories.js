/**
 * Twelve buckets over the engine's sound registry.
 *
 * The registry is a flat 1652 entries, and 1325 of them - eighty percent - are
 * drum-machine kits named `<kit>_<piece>`: `linndrum_sd`, `mc303_hh`,
 * `akaixr10_bd`. A single "drumkits" heading would therefore organise almost
 * nothing, so the kits are split by PIECE instead, across every machine at
 * once. That is also how the list is reached for in a set - the question is
 * "a snare", not "the LinnDrum's snare" - and a specific machine is one word
 * in the filter box, which the piece split does not take away.
 *
 * The categories are fixed and ordered. A bucket that emptied because a bank
 * failed to load is simply not rendered; a name matching nothing lands in
 * `unsorted`, which is the bucket that must never silently swallow a whole
 * bank. Test `no bucket may quietly grow` pins its size for that reason.
 */

/**
 * The drum abbreviations, by piece. Matched against the LAST `_` segment of a
 * kit name and against the whole name for the bare ones (`bd`, `hh`, `cp`).
 *
 * These are the Tidal/Dirt conventions the sample packs are named in, not a
 * taxonomy of percussion: `ht`/`mt`/`lt` are high/mid/low tom, `cr` is crash,
 * `rd` is ride. Anything not in here is not treated as a kit piece at all.
 */
const PIECES = {
  kick: ['bd', 'bassdrum', 'bassdrum1', 'bassdrum2', 'kick'],
  snare: ['sd', 'sn', 'snare', 'rim', 'rimshot'],
  hats: ['hh', 'oh', 'ch', 'hat', 'hihat', 'sh', 'shaker'],
  toms: ['lt', 'mt', 'ht', 'ltm', 'tom', 'thom'],
  cymbals: ['cr', 'rd', 'cy', 'crash', 'ride', 'clash', 'bell', 'belltree', 'cymbal'],
  'claps & perc': [
    'cp', 'clap', 'cb', 'tb', 'perc', 'misc', 'cowbell', 'tambourine', 'sleighbells',
    'vibraslap', 'ratchet', 'slapstick', 'triangles', 'triangle', 'woodblock',
  ],
};

/** Whole names that are melodic instruments rather than kit pieces. */
const MELODIC = [
  'balafon', 'banjo', 'clavisynth', 'dantranh', 'fmpiano', 'folkharp', 'glockenspiel',
  'guitar', 'handbells', 'handchimes', 'harmonica', 'harp', 'kalimba', 'marimba',
  'marktrees', 'piano', 'psaltery', 'sitar', 'steeldrum', 'ukulele', 'vibraphone',
  'xylophone', 'casio', 'kawai', 'ocarina', 'organ', 'pipeorgan', 'recorder', 'sax',
  'saxello', 'steinway', 'strumstick', 'super64', 'tubularbells', 'wineglass',
  'mridangam',
];

/** Hand and world percussion - struck by hand, and not part of a machine kit. */
const WORLD = [
  'ardha', 'bongo', 'cabasa', 'cajon', 'chaapu', 'clave', 'conga', 'darbuka', 'dhi',
  'dhin', 'dhum', 'framedrum', 'guiro', 'gumki', 'ka', 'ki', 'mridangam', 'num',
  'ta', 'tabla', 'tha', 'thi', 'tik', 'tin', 'na', 'nam', 'agogo', 'anvil', 'brakedrum',
  'fingercymbal', 'flexatone', 'gong', 'oceandrum', 'slitdrum', 'timpani',
];

/** Noise sources and non-instrumental oddities. */
const NOISE = [
  'brown', 'pink', 'white', 'crackle', 'noise', 'bytebeat', 'crow', 'insect', 'bird',
  'applause', 'ballwhistle', 'didgeridoo', 'bow', 'bowtwang', 'east', 'wind', 'siren',
  'trainwhistle', 'space', 'metal',
];

/** The order headings appear in. Kit pieces first - they are what a beat needs. */
export const SOUND_CATEGORIES = [
  'kick',
  'snare',
  'hats',
  'toms',
  'cymbals',
  'claps & perc',
  'world perc',
  'melodic',
  'noise & fx',
  'soundfonts',
  'synths',
  'unsorted',
];

/**
 * The kit pieces, split from everything else.
 *
 * Two knobs rather than one on the SOUNDS tab: a beat is built out of the
 * first six and a part is found in the rest, and they are different errands.
 * Stepping through `melodic` on the way from `hats` to `toms` is the flat list
 * again, one heading at a time.
 *
 * Derived from SOUND_CATEGORIES by position, so the order on screen and the
 * order under the knobs cannot disagree.
 */
export const DRUM_CATEGORIES = Object.keys(PIECES);
export const OTHER_CATEGORIES = SOUND_CATEGORIES.filter((c) => !DRUM_CATEGORIES.includes(c));

/** `piece abbreviation -> category`, built once from PIECES. */
const BY_PIECE = new Map();
for (const [category, pieces] of Object.entries(PIECES)) {
  for (const piece of pieces) BY_PIECE.set(piece, category);
}
const inList = (list) => new Set(list);
const MELODIC_SET = inList(MELODIC);
const WORLD_SET = inList(WORLD);
const NOISE_SET = inList(NOISE);

/**
 * Names that are not sounds and must not be offered as one.
 *
 * `_base` is the base URL a sample map was loaded from - superdough records it
 * in the same registry, so `getSoundEntries` reports it. `s("_base")` plays
 * nothing, which is the exact silent failure verify-snippets exists to catch.
 */
const NOT_A_SOUND = new Set(['_base', 'bus']);

/**
 * Trailing articulation and register words. These are how one instrument is
 * spelled several times - `recorder_alto_sus`, `xylophone_hard_ff`,
 * `psaltery_bow` - and none of them changes what the instrument IS.
 */
const ARTICULATIONS = new Set([
  'hard', 'soft', 'vib', 'tremolo', 'vibrato', 'loop', 'sus', 'stacc', 'spiccato',
  'bow', 'bowed', 'pluck', 'mallet', 'stick', 'roll', 'acc', 'pedal', 'ff', 'pp',
  'loud', 'quiet', 'large', 'small', 'hi', 'low', 'modern', 'alto', 'bass', 'tenor',
  'soprano', 'baritone', 'full',
]);

/** `kalimba3` and `tambourine2` are the same instrument as `kalimba`. */
const stripDigits = (word) => word.replace(/\d+$/, '');

/**
 * Which of the twelve a sound belongs to, or null when it is not a sound.
 *
 * `type` comes from superdough's own registry, so soundfonts and synths are
 * identified by what they ARE rather than by how they are spelled - the naming
 * conventions only have to carry the samples.
 */
export function soundCategory(name, type) {
  if (!name || NOT_A_SOUND.has(name)) return null;
  if (type === 'soundfont' || name.startsWith('gm_')) return 'soundfonts';
  if (type === 'synth') return 'synths';

  const parts = name.split('_').filter(Boolean);
  const rawLast = parts[parts.length - 1] ?? '';
  const rawFirst = parts[0] ?? '';
  // Digits are stripped so `kalimba3` is a kalimba - but the RAW word is tried
  // first, because a digit can be part of the name rather than a copy number.
  // `super64` is a harmonica model, and stripping gives `super`, which is
  // nothing. Measured against the registry; it was the last name left over.
  const last = MELODIC_SET.has(rawLast) || WORLD_SET.has(rawLast) || BY_PIECE.has(rawLast)
    ? rawLast
    : stripDigits(rawLast);
  const first = MELODIC_SET.has(rawFirst) || WORLD_SET.has(rawFirst) || BY_PIECE.has(rawFirst)
    ? rawFirst
    : stripDigits(rawFirst);

  // Two naming conventions, and both are real in this registry:
  //
  //   `linndrum_sd`        the KIT leads and the piece is last
  //   `snare_hi`           the PIECE leads and a register follows
  //
  // So try the last segment, then the first. Last first, because the kit form
  // is eighty percent of the list and `bd_something` would otherwise have to
  // be argued about.
  const piece = BY_PIECE.get(last) ?? BY_PIECE.get(first);
  if (piece) return piece;

  // `recorder_alto_sus` is a recorder. The instrument is the first segment
  // once the articulations behind it are recognised as articulations.
  const named = (word) => {
    if (MELODIC_SET.has(word)) return 'melodic';
    if (WORLD_SET.has(word)) return 'world perc';
    if (NOISE_SET.has(word)) return 'noise & fx';
    return null;
  };
  const byLast = ARTICULATIONS.has(last) ? null : named(last);
  const found = named(first) ?? byLast;
  if (found) return found;

  // The `_fx` banks - `korgkrz_fx`, `mc303_fx` - are a machine's odds and ends.
  if (last === 'fx') return 'noise & fx';
  return 'unsorted';
}

/**
 * Group `entries` into `[category, entries[]]`, in SOUND_CATEGORIES order.
 *
 * Empty categories are dropped rather than rendered as a heading with nothing
 * under it - a bank that has not finished loading should not leave six empty
 * sections on screen.
 */
export function groupSounds(entries) {
  const buckets = new Map(SOUND_CATEGORIES.map((c) => [c, []]));
  for (const entry of entries ?? []) {
    const category = soundCategory(entry.name, entry.type);
    if (category) buckets.get(category).push(entry);
  }
  return [...buckets].filter(([, group]) => group.length > 0);
}
