/** Envelope FX: shape how each note or sample rises, holds, and dies away on stage. */
export const category = 'envelope';

export const entries = [
  {
    name: 'pluck',
    code: '.attack(<atk .01: 0.001..0.5 log>).decay(<dec .15: 0.01..2 log>).sustain(<sus 0: 0..1>)',
    hint: 'short decay with zero sustain gives a plucked stab',
  },
  {
    name: 'swell',
    code: '.attack(<atk .3: 0.01..3 log>).release(<rel .3: 0.01..3 log>)',
    hint: 'slow rise and fade turns any sound into a pad swell',
  },
  {
    name: 'adsr all',
    code: '.adsr("<a .01: 0.001..1 log>:<d .1: 0.01..2 log>:<s .5: 0..1>:<r .3: 0.01..2 log>")',
    hint: 'one shorthand knob set for the whole amplitude envelope at once',
  },
  {
    name: 'tail',
    code: '.release(<rel .5: 0.01..3 log>)',
    hint: 'long release smears a fading tail behind every note',
  },
  {
    name: 'clip length',
    code: '.clip(<amt 1: 0.1..2>)',
    hint: 'stretches or chops each event within its slot, tightening or loosening a groove',
  },
  {
    name: 'legato',
    code: '.legato(<amt 1: 0.1..2>)',
    hint: 'lets notes ring past their slot for smoother, overlapping phrasing',
  },
  {
    name: 'choke group',
    code: '.cut(<grp 1: 1..4>)',
    hint: 'chokes overlapping samples in the same group, classic hihat choke',
  },
  {
    name: 'chop',
    code: '.chop(<n 4: 1..32>)',
    hint: 'slices the sample into equal grains for a stutter or granular texture',
  },
  {
    name: 'striate',
    code: '.striate(<n 4: 1..32>)',
    hint: 'interleaves progressive slices of the sample across each repeat',
  },
  {
    name: 'trim',
    code: '.begin(<b 0: 0..0.9>).end(<e 1: 0.1..1>)',
    hint: 'trims the start and end off a sample for a tighter one-shot',
  },
  {
    name: 'filter swell',
    code: '.lpattack(<a .1: 0.01..2 log>).lpdecay(<d .2: 0.01..2 log>).lpenv(<env 4: 0..8>)',
    hint: 'opens the lowpass filter over time for a classic wobble-in move',
  },
  {
    name: 'filter riser',
    code: '.hpattack(<a .05: 0.01..2 log>).hpdecay(<d .2: 0.01..2 log>).hpenv(<env 4: 0..8>)',
    hint: 'sweeps a highpass envelope open for a thinning, rising riser effect',
  },
];
