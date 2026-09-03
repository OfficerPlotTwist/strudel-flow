/** Movement and stereo image: pan sweeps, tremolo, phaser, vibrato. */
export const category = 'motion';

export const entries = [
  {
    name: 'slow sweep pan',
    code: '.pan(sine.slow(<cycles 8: 1..32 log>))',
    hint: 'wide stereo drift; long cycles read as space, short as tremolo',
  },
  {
    name: 'pan flutter',
    code: '.pan(sine.fast(<rate 8: 2..32 log>))',
    hint: 'fast pan lfo blurs into amplitude flutter at high rates',
  },
  {
    name: 'triangle pan',
    code: '.pan(tri.slow(<cycles 4: 0.5..16 log>))',
    hint: 'linear back-and-forth pan, less swoosh than a sine sweep',
  },
  {
    name: 'hard pan',
    code: '.pan(square.fast(<rate 4: 0.5..16 log>))',
    hint: 'hard left/right cuts with no crossfade, good for glitch hits',
  },
  {
    name: 'drift pan',
    code: '.pan(perlin.slow(<cycles 6: 1..16 log>))',
    hint: 'organic unpredictable stereo wander, never repeats exactly',
  },
  {
    name: 'stepped pan',
    code: '.pan(sine.segment(<steps 8: 2..32 log>))',
    hint: 'quantized stereo jumps instead of a smooth sweep',
  },
  {
    name: 'pan width',
    code: '.pan(sine.range(<min 0.2: 0..0.5>, <max 0.8: 0.5..1>))',
    hint: 'narrows or widens the sweep instead of going full left/right',
  },
  {
    name: 'jux split',
    code: '.juxBy(<width 0.5: 0..1>, rev)',
    hint: 'reversed copy in the other channel; width controls stereo distance',
  },
  {
    name: 'amp tremolo',
    code: '.tremolo(<rate 4: 0.5..32 log>).tremolodepth(<depth 0.75: 0.1..1>)',
    hint: 'rhythmic volume pulsing; fast rates blur into buzzy distortion',
  },
  {
    name: 'tremolo sync',
    code: '.tremolosync(<cycles 4: 1..16 log>)',
    hint: 'locks tremolo to cycle divisions instead of a free-running rate',
  },
  {
    name: 'phaser sweep',
    code: '.phaser(<rate 1: 0.1..16 log>).phaserdepth(<depth 0.75: 0..1>)',
    hint: 'swirling comb-filter wash, classic slow guitar-pedal movement',
  },
  {
    name: 'vibrato wobble',
    code: '.vibrato(<rate 5: 0.5..32 log>).vibmod(<depth 0.5: 0.05..12 log>)',
    hint: 'pitch wobble; high rates and depth turn into fm-like roughness',
  },
];
