/** Pitch and playback-rate moves: octave jumps, semitone nudges, drift, and glide for live reshaping of a pattern's pitch. */
export const category = 'pitch';

export const entries = [
  {
    name: 'octave down',
    code: '.speed(<rate .5: 0.25..4 log>)',
    hint: 'halves pitch and doubles sample length',
  },
  {
    name: 'semitone shift',
    code: '.transpose(<semi 0: -24..24>)',
    hint: 'shifts notes up or down by semitones',
  },
  {
    name: 'detune',
    code: '.detune(<amt 0.2: 0..1>)',
    hint: 'spreads stacked oscillator voices out of tune',
  },
  {
    name: 'octave',
    code: '.octave(<oct 3: 0..8>)',
    hint: 'sets the base octave for a synth voice',
  },
  {
    name: 'unison',
    code: '.unison(<voices 1: 1..7>)',
    hint: 'stacks detuned copies for a thicker synth sound',
  },
  {
    name: 'pitch glide',
    code: '.accelerate(<amt 0: -8..8>)',
    hint: 'bends pitch up or down while a sample plays',
  },
  {
    name: 'pitch env',
    code: '.penv(<semi 12: -24..24>)',
    hint: 'sweeps pitch by semitones over each note envelope',
  },
  {
    name: 'env attack',
    code: '.pattack(<time 0.05: 0..1>)',
    hint: 'slows how fast the pitch envelope reaches its target',
  },
  {
    name: 'env release',
    code: '.prelease(<time 0.1: 0..1>)',
    hint: 'lets the pitch envelope tail off after note end',
  },
  {
    name: 'vibrato',
    code: '.vibrato(<hz 5: 1..20 log>).vibmod(<depth 0.5: 0..12>)',
    hint: 'wobbles pitch at a rate and depth, good on sustained notes',
  },
  {
    name: 'hurry',
    code: '.hurry(<rate 1.5: 0.5..4 log>)',
    hint: 'speeds up both the groove and the sample pitch together',
  },
  {
    name: 'scale step',
    code: '.scaleTranspose(<steps 0: -14..14>)',
    hint: 'moves notes by scale degrees, needs a scale already set',
  },
];
