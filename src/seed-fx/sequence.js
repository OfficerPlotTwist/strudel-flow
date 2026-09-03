/** Reorders and re-triggers events within the cycle — chops, flips, and permutes a pattern for live variation. */
export const category = 'sequence';

export const entries = [
  {
    name: 'flip chance',
    code: '.sometimesBy(<odds .5: 0..1>, rev)',
    hint: 'reverses the cycle at random, odds control how often',
  },
  {
    name: 'ping pong',
    code: '.inside(<parts 2: 1..8>, palindrome)',
    hint: 'plays forward then backward within each chunked subdivision',
  },
  {
    name: 'step forward',
    code: '.iter(<parts 4: 2..8>)',
    hint: 'chops into parts, rotating the start point forward each cycle',
  },
  {
    name: 'step backward',
    code: '.iterBack(<parts 4: 2..8>)',
    hint: 'like step forward but rotates the start point in reverse',
  },
  {
    name: 'shuffle bars',
    code: '.shuffle(<parts 4: 2..8>)',
    hint: 'chops the cycle into parts and reorders them each pass',
  },
  {
    name: 'scramble hits',
    code: '.scramble(<parts 8: 2..16>)',
    hint: 'chops into parts and picks them at random, can repeat a part',
  },
  {
    name: 'chunk speed',
    code: '.chunk(<parts 4: 2..8>, x => x.speed(<rate 2: 0.5..4 log>))',
    hint: 'cycles through parts, speeding up whichever part is active',
  },
  {
    name: 'reverse chunk',
    code: '.chunkBack(<parts 4: 2..8>, x => x.gain(<amt 1.5: 0.5..2>))',
    hint: 'cycles through parts in reverse order, boosting the active part',
  },
  {
    name: 'zoom reverse',
    code: '.outside(<factor 2: 1..8>, rev)',
    hint: 'stretches the cycle out before reversing, a slower flip feel',
  },
  {
    name: 'syncopate chance',
    code: '.sometimesBy(<odds .3: 0..1>, press)',
    hint: 'randomly shifts events halfway into their slot for a swung feel',
  },
  {
    name: 'linger loop',
    code: '.linger(<fraction .5: 0.125..1 log>)',
    hint: 'grabs a slice of the cycle and loops it to fill the rest',
  },
  {
    name: 'repeat cycles',
    code: '.repeatCycles(<times 2: 1..8>)',
    hint: 'plays the same cycle n times before it moves on',
  },
];
