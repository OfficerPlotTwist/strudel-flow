/** Mix: level, placement, and routing moves for balancing layers live without retriggering anything. */
export const category = 'mix';

export const entries = [
  {
    name: 'trim',
    code: '.gain(<level 0.7: 0..1.2>)',
    hint: 'exponential level trim, the everyday volume knob for a layer',
  },
  {
    name: 'linear trim',
    code: '.amp(<level 0.6: 0..1>)',
    hint: 'like gain but linear response, gentler feel for small tweaks',
  },
  {
    name: 'accent',
    code: '.velocity(<amt 0.85: 0..1>)',
    hint: 'scales dynamics on top of gain, softens or hardens hits',
  },
  {
    name: 'output stage',
    code: '.postgain(<level 0.6: 0.1..1>)',
    hint: 'final trim after all other effects, use to tame a loud chain',
  },
  {
    name: 'place',
    code: '.pan(<pos 0.5: 0..1>)',
    hint: 'moves the layer left to right in the stereo field',
  },
  {
    name: 'send bus',
    code: '.orbit(<bus 1: 0..3>)',
    hint: 'assigns the layer to a different effect bus, changes its reverb and delay',
  },
  {
    name: 'reroute',
    code: '.channel(<ch 0: 0..7>)',
    hint: 'sends the layer to a specific output channel on the interface',
  },
  {
    name: 'sidechain pump',
    code: '.duck(<bus 2: 0..3>)',
    hint: 'ducks this layer whenever the target orbit fires, classic sidechain pump',
  },
  {
    name: 'pump depth',
    code: '.duckdepth(<amount 0.6: 0..1>)',
    hint: 'how far the sidechain pumps down, 0 is off, near 1 is a hard duck',
  },
  {
    name: 'pump recovery',
    code: '.duckattack(<time 0.2: 0.05..1>)',
    hint: 'how fast the ducked signal climbs back to normal volume',
  },
  {
    name: 'gate',
    code: '.mask("1(<hits 3: 1..8>,8)")',
    hint: 'euclidean on/off gate, mutes the layer between hits without stopping it',
  },
  {
    name: 'stereo split',
    code: '.juxBy(<width 0.5: 0..1>, rev)',
    hint: 'splits left and right channels apart, 0 is mono and 1 is full width',
  },
];
