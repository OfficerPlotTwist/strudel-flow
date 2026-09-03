/** Filter FX: cutoff sweeps, resonance, filter envelopes, and character filters for shaping timbre live. */
export const category = 'filter';

export const entries = [
  {
    name: 'low sweep',
    code: '.lpf(<cut 900: 20..8000 log>).lpq(<res 8: 0..25>)',
    hint: 'classic filter sweep; res past 15 self-oscillates',
  },
  {
    name: 'high sweep',
    code: '.hpf(<cut 400: 20..8000 log>).hpq(<res 5: 0..25>)',
    hint: 'thins out the low end; push cut up for a telephone effect',
  },
  {
    name: 'band pass',
    code: '.bpf(<cut 800: 100..5000 log>).bpq(<res 10: 0..25>)',
    hint: 'narrows to a nasal midrange band; good for lo-fi vocal chops',
  },
  {
    name: 'dj cut',
    code: '.djf(<pos 0.5: 0..1>)',
    hint: 'one knob dj-style filter; below 0.5 low pass, above 0.5 high pass',
  },
  {
    name: 'ladder growl',
    code: '.lpf(<cut 600: 100..4000 log>).lpq(<res 12: 0..25>).ftype(<type 1: 0..2>)',
    hint: 'switches filter model; type 1 is the aggressive ladder filter',
  },
  {
    name: 'lp pluck',
    code: '.lpf(<cut 300: 50..4000 log>).lpenv(<depth 4: 0..8>).lpdecay(<decay 0.15: 0.02..1>)',
    hint: 'envelope snaps the cutoff open then closes fast; percussive pluck',
  },
  {
    name: 'lp swell',
    code: '.lpf(<cut 300: 50..4000 log>).lpattack(<attack 0.5: 0.02..2>).lpenv(<depth 5: 0..8>)',
    hint: 'slow filter attack for pads that bloom open over time',
  },
  {
    name: 'hp pluck',
    code: '.hpf(<cut 200: 50..4000 log>).hpenv(<depth 4: 0..8>).hpdecay(<decay 0.1: 0.02..1>)',
    hint: 'inverse pluck; opens the top end briefly then closes back down',
  },
  {
    name: 'lp wobble',
    code: '.lpf(<cut 500: 100..4000 log>).lprate(<rate 4: 0.1..16 log>).lpdepth(<depth 1: 0..2>)',
    hint: 'lfo-driven wobble bass; raise rate for dubstep-style riding',
  },
  {
    name: 'bp wobble',
    code: '.bpf(<cut 800: 100..4000 log>).bprate(<rate 2: 0.1..16 log>).bpdepth(<depth 1: 0..2>)',
    hint: 'band-pass lfo wobble; narrower and more vocal than lp wobble',
  },
  {
    name: 'resonance rise',
    code: '.lpf(<cut 1200: 200..8000 log>).lpq(<res 18: 0..25>)',
    hint: 'high resonance builds tension before a drop; watch for whistling',
  },
  {
    name: 'lp hold',
    code: '.lpf(<cut 1200: 200..6000 log>).lpsustain(<sustain 0.6: 0..1>).lprelease(<release 0.3: 0.02..2>)',
    hint: 'holds the filter open then eases shut on note-off; smooth pad tails',
  },
];
