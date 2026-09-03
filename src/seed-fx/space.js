/** Space FX: reverb, room size, dry/wet balance, delay, and stereo width for placing a sound in a room. */
export const category = 'space';

export const entries = [
  {
    name: 'small room',
    code: '.room(<wet .25: 0..1>).roomsize(<size 2: 0.5..6>)',
    hint: 'tight ambience; keep wet under .4 or the groove smears',
  },
  {
    name: 'big hall',
    code: '.room(<wet .5: 0..1>).roomsize(<size 8: 4..10>)',
    hint: 'cavernous tail; watch for a muddy low end at high wet',
  },
  {
    name: 'dry wet mix',
    code: '.room(<wet .4: 0..1>).dry(<dry .8: 0..1>)',
    hint: 'dry keeps the direct signal audible under the reverb',
  },
  {
    name: 'dark reverb',
    code: '.room(<wet .4: 0..1>).roomlp(<freq 2000: 200..8000 log>)',
    hint: 'rolls off reverb highs for a warm, distant wash',
  },
  {
    name: 'bright reverb',
    code: '.room(<wet .3: 0..1>).roomlp(<freq 12000: 4000..18000 log>)',
    hint: 'airy shimmer that cuts through a busy mix',
  },
  {
    name: 'reverb tail',
    code: '.room(<wet .4: 0..1>).roomfade(<fade .6: 0.1..3>)',
    hint: 'longer fade smears transients into a continuous wash',
  },
  {
    name: 'reverb decay',
    code: '.roomsize(<size 4: 0.5..10>).roomdim(<freq 5000: 500..12000 log>)',
    hint: 'shapes how fast the tail loses its top end as it decays',
  },
  {
    name: 'slap delay',
    code: '.delay(<wet .3: 0..1>).delaytime(<time .125: 0.03..1 log>)',
    hint: 'short slap adds width without cluttering the beat',
  },
  {
    name: 'echo trail',
    code: '.delay(<wet .35: 0..1>).delayfeedback(<fb .4: 0..0.9>)',
    hint: 'push feedback near .9 for runaway echoes, back off fast',
  },
  {
    name: 'synced echo',
    code: '.delay(<wet .3: 0..1>).delaysync(<cycles .25: 0.125..2 log>)',
    hint: 'locks echoes to the tempo instead of raw seconds',
  },
  {
    name: 'stereo width',
    code: '.juxBy(<amt .5: 0..1>, rev)',
    hint: 'splits a reversed copy hard left/right; 1 is full stereo',
  },
  {
    name: 'pan sweep',
    code: '.pan(<pos .5: 0..1>)',
    hint: 'static placement in the stereo field, not an lfo',
  },
];
