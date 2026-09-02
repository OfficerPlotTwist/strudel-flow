/**
 * Starter snippets shipped in code. `localStorage` can't be written to from
 * outside the browser, so these are merged into the user's library at load
 * time by `seedLibrary` in storage.js. Pure data only - no DOM, no @strudel/*.
 */
export const SEED_SNIPPETS = [
  {
    name: 'piano_arp',
    code: `setcpm(84/4)

$: n("0 2 4 7 9 7 4 2")
  .scale("<a3:minor f3:major c4:major g3:major>")
  .s("piano")
  .gain(0.55)
  .room(0.6)
  .delay(0.3)
  .delaytime(0.375)
  .delayfeedback(0.4)`,
  },
  {
    name: 'dnb_chill',
    code: `setcpm(174/4)

$: s("bd ~ ~ ~ ~ ~ sd ~ ~ ~ bd ~ ~ ~ sd ~")
  .bank("RolandTR909")
  .gain(0.9)

$: s("hh*16")
  .bank("RolandTR909")
  .gain("[0.35 0.2 0.28 0.2]*4")
  .pan(sine.range(0.35, 0.65))

$: note("<a1 f1 c2 g1>")
  .s("sawtooth")
  .lpf(perlin.range(180, 700))
  .gain(0.5)
  .room(0.2)`,
  },
];
