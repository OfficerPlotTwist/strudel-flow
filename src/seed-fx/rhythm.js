/** Rhythm: reshape the rate and subdivision of events without touching pitch or timbre. */
export const category = 'rhythm';

export const entries = [
  {
    name: 'double time',
    code: '.fast(<mult 2: 0.25..8 log>)',
    hint: 'past 4 it stops reading as rhythm and becomes texture',
  },
  {
    name: 'half time',
    code: '.slow(<mult 2: 0.25..8 log>)',
    hint: 'stretches events out, good for dropping energy into a breakdown',
  },
  {
    name: 'repeat hits',
    code: '.ply(<n 2: 1..24>)',
    hint: 'retriggers each event n times, turns hits into rolls at high values',
  },
  {
    name: 'euclid pulse',
    code: '.euclid(<pulses 3: 1..24>, <steps 8: 2..24>)',
    hint: 'classic euclidean rhythm, pulses spread evenly across steps',
  },
  {
    name: 'euclid rotate',
    code: '.euclidRot(<pulses 3: 1..24>, <steps 8: 2..24>, <rot 1: 0..24>)',
    hint: 'same euclidean shape but rotated to start the hits elsewhere',
  },
  {
    name: 'euclid glue',
    code: '.euclidLegato(<pulses 3: 1..24>, <steps 8: 2..24>)',
    hint: 'euclidean rhythm with no gaps, each hit sustains to the next',
  },
  {
    name: 'resample',
    code: '.segment(<n 8: 1..32>)',
    hint: 'chops a continuous pattern into n discrete steps per cycle',
  },
  {
    name: 'swing feel',
    code: '.swingBy(<amt 0.1: 0.05..0.5>, <div 4: 1..24>)',
    hint: 'delays every other subdivision for a shuffled, human groove',
  },
  {
    name: 'slice chunks',
    code: '.chunk(<n 4: 1..24>, x=>x.fast(2))',
    hint: 'speeds up a different slice of the cycle each time round',
  },
  {
    name: 'echo delay',
    code: '.off(<time 0.125: 0.0625..0.5 log>, x=>x.fast(2))',
    hint: 'layers a faster copy of the pattern shortly after the original',
  },
  {
    name: 'hurry up',
    code: '.hurry(<mult 2: 0.5..4 log>)',
    hint: 'speeds up rate and sample pitch together, more drastic than fast',
  },
  {
    name: 'loop fraction',
    code: '.linger(<frac 0.5: 0.125..1 log>)',
    hint: 'grabs the start of the cycle and stutters it to fill the rest',
  },
];
