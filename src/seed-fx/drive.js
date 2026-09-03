/** Drive FX: crush, distort, fold, and grind chains for dirtying up a pattern mid-set. */
export const category = 'drive';

export const entries = [
  {
    name: 'bit crush',
    code: '.crush(<bits 8: 1..16>)',
    hint: 'lower bits = grittier; under 4 is destruction',
  },
  {
    name: 'sample crush',
    code: '.coarse(<factor 4: 1..32 log>)',
    hint: 'fake-downsamples the audio; higher factor adds crunchy aliasing',
  },
  {
    name: 'wave distort',
    code: '.distort(<amount 2: 0..10>).postgain(<makeup 0.7: 0.2..1>)',
    hint: 'classic waveshaping dirt; makeup gain keeps it from blasting',
  },
  {
    name: 'wave fold',
    code: '.fold(<amount 2: 0..8>)',
    hint: 'wavefolding distortion; more metallic and unstable than clipping',
  },
  {
    name: 'filter drive',
    code: '.ftype(<type 1: 0..2>).lpf(<cut 1200: 200..6000 log>).drive(<amount 3: 0..8>)',
    hint: 'overdrives the filter itself; type 1 is the aggressive ladder model',
  },
  {
    name: 'squelch',
    code: '.squiz(<amount 4: 1..16>)',
    hint: 'ring-mod-ish squeal; weirder and more melodic than a straight crush',
  },
  {
    name: 'lofi stack',
    code: '.crush(<bits 6: 1..16>).coarse(<factor 2: 1..16 log>)',
    hint: 'combines bit and sample rate reduction for a dirty lofi sampler feel',
  },
  {
    name: 'saturate',
    code: '.distort(<amount 0.6: 0..3>)',
    hint: 'gentle warmth at low settings, not full destruction; safe to leave on',
  },
  {
    name: 'gain stage',
    code: '.postgain(<level 0.6: 0.1..1>)',
    hint: 'turns the whole pattern down after stacking other drive effects',
  },
  {
    name: 'total wreck',
    code: '.crush(<bits 3: 1..16>).distort(<amount 6: 0..10>).postgain(<makeup 0.4: 0.1..1>)',
    hint: 'stacks crush and distortion for full destruction; makeup gain tames the peak',
  },
  {
    name: 'fold crush',
    code: '.fold(<amount 3: 0..8>).crush(<bits 6: 1..16>)',
    hint: 'metallic folding on top of bit crushing; unstable and biting',
  },
  {
    name: 'radio grind',
    code: '.coarse(<factor 6: 1..32 log>).hpf(<cut 500: 100..3000 log>)',
    hint: 'downsampled crunch with the low end thinned out; telephone-radio grit',
  },
];
