/** Time-based repeats for live performance: delay, echo, feedback, ping-pong. */
export const category = 'time';

export const entries = [
  {
    name: 'dub delay',
    code: '.delay(<wet .5: 0..1>).delaytime(<time .375: 0.02..1 log>).delayfeedback(<fb .6: 0..0.95>)',
    hint: 'feedback past .9 runs away; delaytime .375 is a dotted eighth',
  },
  {
    name: 'slapback',
    code: '.delay(<wet .35: 0..1>).delaytime(<time .06: 0.02..0.3 log>)',
    hint: 'short doubling with no tail, thickens a single hit',
  },
  {
    name: 'long tail',
    code: '.delay(<wet .55: 0..1>).delaytime(<time 1: 0.1..2 log>).delayfeedback(<fb .75: 0..0.95>)',
    hint: 'big ambient wash, pull feedback down fast if it starts to mud up the mix',
  },
  {
    name: 'tempo delay',
    code: '.delay(<wet .5: 0..1>).delaysync(<cycles .25: 0.03125..2 log>).delayfeedback(<fb .5: 0..0.9>)',
    hint: 'locks delay time to cycles instead of seconds, survives a tempo change',
  },
  {
    name: 'quarter echo',
    code: '.delaysync(<cycles .25: 0.0625..1 log>).delay(<wet .45: 0..1>)',
    hint: 'clean quarter-note repeats, stays in time when the clock shifts',
  },
  {
    name: 'eighth echo',
    code: '.delaysync(<cycles .125: 0.0625..1 log>).delay(<wet .5: 0..1>).delayfeedback(<fb .45: 0..0.9>)',
    hint: 'driving eighth-note bounce, good under hats',
  },
  {
    name: 'triplet delay',
    code: '.delaytime(<time .333: 0.02..1 log>).delay(<wet .5: 0..1>).delayfeedback(<fb .5: 0..0.9>)',
    hint: 'classic triplet swing playing against a straight beat',
  },
  {
    name: 'feedback runaway',
    code: '.delay(<wet .6: 0..1>).delayfeedback(<fb .7: 0.3..0.92>)',
    hint: 'push fb toward the top for building chaos; ride it back down to recover',
  },
  {
    name: 'whisper delay',
    code: '.delay(<wet .2: 0..1>).delaytime(<time .2: 0.02..1 log>).delayfeedback(<fb .3: 0..0.8>)',
    hint: 'subtle depth without an obvious repeat, sits well under vocals',
  },
  {
    name: 'multi echo',
    code: '.echo(<times 3: 1..8>, <time .1666: 0.02..1 log>, <fb .5: 0..0.9>)',
    hint: 'stacks discrete decaying copies; times past 6 gets busy fast',
  },
  {
    name: 'sparse echo',
    code: '.echo(<times 2: 1..6>, <time .5: 0.05..1.5 log>, 0.3)',
    hint: 'a couple of wide-spaced repeats, good for punctuating an accent',
  },
  {
    name: 'dense echo',
    code: '.echo(<times 6: 2..10>, <time .08: 0.02..0.4 log>, <fb .35: 0..0.7>)',
    hint: 'fast flurry of short copies, keep feedback low or it smears',
  },
];
