/** Structure: copies of the pattern set against itself — stereo splits, delayed doubles, and stacked layers. */
export const category = 'structure';

export const entries = [
  {
    name: 'jux speed',
    code: '.jux(x => x.speed(<rate 1.5: 0.5..3 log>))',
    hint: 'stereo split, right channel pitched/sped differently',
  },
  {
    name: 'jux crush',
    code: '.jux(x => x.crush(<bits 4: 1..16>))',
    hint: 'stereo split, right channel gets crunchy and lo-fi',
  },
  {
    name: 'off delay',
    code: '.off(<shift .125: 0.03..0.5 log>, x => x.gain(<amt .6: 0.1..1>))',
    hint: 'quick delayed double layered on top, tune its loudness',
  },
  {
    name: 'off filtered',
    code: '.off(<shift .1875: 0.03..0.5 log>, x => x.lpf(<cut 800: 100..4000 log>))',
    hint: 'delayed copy darkened via lowpass, dubby smear',
  },
  {
    name: 'off detune',
    code: '.off(<shift .25: 0.03..1 log>, x => x.speed(<rate 1.5: 0.5..3 log>))',
    hint: 'delayed copy at a different pitch, chorus-like doubling',
  },
  {
    name: 'superimpose fast',
    code: '.superimpose(x => x.fast(<rate 2: 1..4 log>))',
    hint: 'layers a faster copy on top, denser without changing tempo',
  },
  {
    name: 'superimpose detune',
    code: '.superimpose(x => x.speed(<rate 1.01: 0.9..1.1>))',
    hint: 'layers a near-identical copy slightly detuned, thickens the sound',
  },
  {
    name: 'superimpose filtered',
    code: '.superimpose(x => x.hpf(<cut 2000: 500..8000 log>))',
    hint: 'layers a bright filtered copy on top, adds air',
  },
  {
    name: 'stut repeats',
    code: '.stut(<times 3: 2..8>, <fb .5: 0..0.9>, <time .125: 0.02..0.5 log>)',
    hint: 'rhythmic echo repeats with decaying feedback, watch buildup at high feedback',
  },
  {
    name: 'echo trail',
    code: '.echo(<times 3: 2..8>, <time .125: 0.02..0.5 log>, <fb .5: 0.1..0.9>)',
    hint: 'classic tape-style echo trail, decaying repeats',
  },
  {
    name: 'layer split',
    code: '.layer(x => x.rev(), x => x.fast(<rate 2: 1..4 log>))',
    hint: 'stacks a reversed copy and a sped-up copy, no dry original',
  },
  {
    name: 'layer detuned',
    code: '.layer(x => x.speed(<rateA .5: 0.25..1 log>), x => x.speed(<rateB 2: 1..4 log>))',
    hint: 'stacks a slowed and a sped copy at once, octave-style spread',
  },
];
