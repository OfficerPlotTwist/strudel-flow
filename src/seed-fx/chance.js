/** Probability and randomness moves: thin, flip, or destabilize a pattern for a set stretch of a live set. */
export const category = 'chance';

export const entries = [
  {
    name: 'thin out',
    code: '.degradeBy(<amount 0.3: 0..0.9>)',
    hint: 'drops that fraction of events at random; past .6 the groove goes',
  },
  {
    name: 'fill in',
    code: '.undegradeBy(<amount 0.7: 0.1..1>)',
    hint: 'keeps only the complement of degradeBy; lower values thin harder',
  },
  {
    name: 'speed roulette',
    code: '.sometimesBy(<odds 0.3: 0..1>, x => x.speed(<rate 2: 0.5..4 log>))',
    hint: 'randomly kicks some hits into double or half time',
  },
  {
    name: 'crush cycles',
    code: '.someCyclesBy(<odds 0.25: 0..1>, x => x.crush(<bits 6: 2..16>))',
    hint: 'whole cycles turn lo-fi and crunchy at random',
  },
  {
    name: 'often warp',
    code: '.often(x => x.speed(<rate 1.5: 0.5..4 log>))',
    hint: 'most hits get retuned in speed; frequent but not constant',
  },
  {
    name: 'rare blast',
    code: '.rarely(x => x.gain(<amount 1.5: 1..2.5>))',
    hint: 'occasional loud hit cuts through the mix',
  },
  {
    name: 'flash crush',
    code: '.almostNever(x => x.crush(<bits 4: 2..16>))',
    hint: 'a rare, heavy bitcrush flash once in a while',
  },
  {
    name: 'pan pull',
    code: '.almostAlways(x => x.pan(<pos 0.8: 0..1>))',
    hint: 'nearly every hit gets pulled toward this pan position',
  },
  {
    name: 'stutter cycles',
    code: '.someCyclesBy(<odds 0.3: 0..1>, x => x.ply(<n 2: 2..4>))',
    hint: 'some cycles double or triple up every hit',
  },
  {
    name: 'flip stereo',
    code: '.sometimesBy(<odds 0.5: 0..1>, x => x.jux(rev))',
    hint: 'half the time the right channel plays the pattern backwards',
  },
  {
    name: 'delay dice',
    code: '.sometimesBy(<odds 0.3: 0..1>, x => x.delay(<amount 0.5: 0..1>))',
    hint: 'occasionally throws hits into a delay tail',
  },
  {
    name: 'wander pan',
    code: '.pan(rand.range(<lo 0.2: 0..0.5>, <hi 0.8: 0.5..1>))',
    hint: 'pans drift randomly between these bounds every event',
  },
];
