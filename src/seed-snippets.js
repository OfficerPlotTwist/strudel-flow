/**
 * Starter snippets shipped in code. `localStorage` can't be written to from
 * outside the browser, so these are merged into the user's library at load
 * time by `seedLibrary` in storage.js. Pure data only - no DOM, no @strudel/*.
 */
import { SEED_BLOCKS } from './seed-blocks.js';

export const SEED_SNIPPETS = [
  // The categorised block collection. Kept in its own file purely for size -
  // it is the same shape as the entries below.
  ...SEED_BLOCKS,
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

$: n("<2 0 4 1>")
  .scale("f1:major")
  .s("sawtooth")
  .lpf(perlin.range(180, 700))
  .gain(0.5)
  .room(0.2)`,
  },
  {
    name: 'generative_ambient',
    code: `// Generative Ambient - infinite study music.
// Coprime loop lengths (16/13/7/8/5) never re-align, so it never
// sounds like an 8-bar loop. A 4-section controller (32 cycles each,
// 128-cycle arc) fades melody and percussion in and back out.
setcpm(60/4)

// A: Drone - constant foundation, very slow filter drift
$: n("0")
  .scale("d2:minor")
  .s("sawtooth")
  .lpf(sine.range(110, 300).slow(41))
  .gain(0.3)
  .room(0.9)
  .attack(4)
  .release(8)

// B: Pad - Dm9 / Bbmaj7 / Fmaj9 / Cadd9, 4 cycles each = 16-cycle loop
$: n("<[5,7,9,11,13] [3,5,7,9] [0,2,4,6,8] [4,6,8,12]>")
  .scale("f2:major")
  .slow(4)
  .s("triangle")
  .gain(0.22)
  .lpf(900)
  .room(0.85)
  .attack(3)
  .release(6)

// D: Texture - 13-cycle loop of filtered noise swells
$: s("pink")
  .slow(13)
  .gain(perlin.range(0.04, 0.13).slow(9))
  .lpf(perlin.range(400, 2600).slow(17))
  .pan(sine.range(0.3, 0.7).slow(23))
  .room(0.7)

// C: Sparse motif - 7-cycle loop, density set by the section controller
$: n("0 ~ ~ 4 ~ 7 ~ 2")
  .slow(7)
  .scale("d4:minor")
  .s("piano")
  .degradeBy("<0.8 0.6 0.4 0.75>".slow(32))
  .gain(0.3)
  .room(0.8)
  .delay(0.4)
  .delaytime(0.5)
  .delayfeedback(0.35)

// Bass - 5-cycle loop, felt rather than heard
$: n("<2 ~ 0 ~ 4>")
  .scale("bb0:major")
  .slow(5)
  .s("sine")
  .gain(0.35)
  .attack(1)
  .release(3)

// Subtle rhythm - 8-cycle loop, mostly absent in sections 1 and 4
$: s("bd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ rim ~")
  .slow(8)
  .bank("RolandTR707")
  .degradeBy("<1 0.85 0.7 0.9>".slow(32))
  .gain(0.4)
  .room(0.6)`,
  },
  {
    name: 'space_adventure',
    kind: 'songs',
    code: `// ============================================================
//  GET GOT  —  Death Grips (The Money Store, 2012)
//  Strudel interpretation: LEAD / MELODY / BASS
//  Paste into https://strudel.cc  ->  Ctrl+Enter to play
//  Ctrl+. to stop.  Comment out any const in the stack() at
//  the bottom to solo/mute parts.
// ============================================================

setcpm(132 / 4)              // ~132 BPM, 4/4  (1 cycle = 1 bar)

// Key: F minor  (F  G  Ab  Bb  C  Db  Eb)
// Parts are written as scale degrees, not letters: n(0) is the root
// named in .scale(), each step of the scale is +1, and 7 is an octave.
// Strudel pitch convention: c5 = middle C. So f3 ~= 87 Hz.
// Transpose the whole track: change .add(note(0)) on the stack.


// ------------------------------------------------------------
// 1. SUB  — the floor. Pure sine, no character, just weight.
// ------------------------------------------------------------
const sub = n("<[0 ~ ~ 0 ~ ~ 0 ~] [0 ~ ~ 0 ~ ~ [-2 -1] ~]>")
  .scale("f2:minor")
  .s("sine")
  .attack(.004).decay(.18).sustain(.4).release(.12)
  .gain(.9)


// ------------------------------------------------------------
// 2. BASS — machine-gun saw riff, filtered, distorted.
//    Two-bar phrase: bar 1 nails the root, bar 2 walks up.
// ------------------------------------------------------------
const bass = n("<[0 ~ 0 ~ ~ 0 ~ 0] [0 ~ 0 ~ ~ 0 ~ [2 3]]>")
  .scale("f3:minor")
  .s("sawtooth")
  .lpf(perlin.range(240, 820).slow(6))
  .lpq(9)
  .attack(.002).decay(.10).sustain(.22).release(.06)
  .shape(.4)                 // waveshaper grit
  .gain(.85)

// Optional: octave-up ghost note layer for bite (adds mid presence)
const bassGhost = bass
  .add(note(12))
  .lpf(1600).gain(.28).degradeBy(.35)


// ------------------------------------------------------------
// 3. LEAD — the abrasive detuned stab. 16ths, angular, dry.
//    This is the "shove" of the track. Keep it ugly.
// ------------------------------------------------------------
const lead = n("[4 ~ 2 ~] [4 5 4 ~] [2 ~ 0 ~] [~ -1 0 ~]")
  .scale("f5:minor")
  .s("sawtooth")
  .superimpose(x => x.add(note(.14)).gain(.6))   // detune twin
  .superimpose(x => x.add(note(-.11)).gain(.55)) // detune twin 2
  .lpf(sine.range(900, 4200).slow(4))
  .lpq(11)
  .attack(.001).decay(.09).sustain(0).release(.05)
  .crush(9)                  // bitcrush = 2012 Money Store nastiness
  .shape(.25)
  .pan(sine.range(.35, .65).slow(3))
  .gain(.55)


// ------------------------------------------------------------
// 4. MELODY / HOOK — the pitched-up vocal-ish motif.
//    Sparse, high, drenched. 4-bar phrase, sits ON TOP of lead.
// ------------------------------------------------------------
const melody = n("<[0 ~ ~ 2] [4 ~ 3 2] [0 ~ ~ -1] [0 ~ ~ ~]>")
  .scale("f5:minor")
  .s("triangle")
  .superimpose(x => x.add(note(12)).s("square").gain(.18))
  .vib(5.5).vibmod(.12)      // warble
  .attack(.01).decay(.3).sustain(.3).release(.4)
  .lpf(3800)
  .delay(.45).delaytime(.1875).delayfeedback(.42)  // dotted-8th at 132
  .room(.35).roomsize(3)
  .gain(.5)


// ------------------------------------------------------------
// 5. STAB CHORDS — optional harmonic glue under the hook
// ------------------------------------------------------------
const stabs = n("<[~ ~ [0,2,4] ~] [~ ~ ~ [2,4,6]] [~ ~ [-2,0,2] ~] [~ [-1,1,3] ~ ~]>")
  .scale("f4:minor")
  .s("square")
  .attack(.002).decay(.14).sustain(0).release(.1)
  .lpf(2200).crush(8).gain(.3)


// ------------------------------------------------------------
// 6. DRUMS — minimal skeleton so the riffs sit in a groove.
//    Delete this block if you only wanted the tonal parts.
// ------------------------------------------------------------
const drums = stack(
  s("bd ~ ~ bd ~ bd ~ ~").gain(1.1).shape(.3),
  s("~ ~ sd ~ ~ ~ sd ~").gain(.9).room(.18),
  s("hh*16").gain(.28).degradeBy(.18).pan(rand.range(.4, .6)),
  s("~ ~ ~ ~ ~ ~ ~ oh").gain(.35)
)


// ------------------------------------------------------------
//  MIX — comment a line out to mute that part
// ------------------------------------------------------------
stack(
  sub,
  bass,
  bassGhost,
  lead,
  melody,
  // stabs,
  drums
)
  .add(note(0))              // <- global transpose in SEMITONES (note(2) = G minor)
  .postgain(.9)


// ============================================================
//  VARIATIONS — paste over the const above to swap a part
// ============================================================
//
// -- Bass, half-time / dub version:
// const bass = n("<[0 ~ ~ ~ ~ ~ 0 ~] [-2 ~ ~ ~ -1 ~ ~ ~]>").scale("f3:minor")
//   .s("sawtooth").lpf(500).lpq(8).shape(.5).gain(.9)
//
// -- Lead, faster + reversed every other bar:
// const lead = ...(as above)... .jux(rev).fast("<1 1 2 1>")
//
// -- Melody, call-and-response ("get got / get got"):
// const melody = n("<[0 0 ~ ~] [~ ~ 4 4] [2 2 ~ ~] [~ ~ 0 ~]>").scale("f5:minor")
//   .s("triangle").vib(6).vibmod(.2)
//   .delay(.5).delaytime(.1875).delayfeedback(.5).gain(.5)
//
// -- Drop everything but sub + hook for 4 bars:
//   add .mask("<1 1 1 0>") to lead and drums
//
// ============================================================`,
  },
  {
    name: 'get_got',
    kind: 'songs',
    code: `// ==============================================================
//  GET GOT  --  Death Grips (The Money Store, 2012)
//  Strudel arrangement, broken out layer by layer.
//  Paste into https://strudel.cc and hit Ctrl+Enter.
//  ~129 BPM  |  1 cycle = 1 bar of 4/4
// ==============================================================
//  Uncomment on a self-hosted Strudel; strudel.cc preloads these.
//  await samples('github:tidalcycles/dirt-samples')

setcps(129/60/4)

// --------------------------------------------------------------
// LAYER 1 - KICK
// Blown-out 909 kick with a lurching, off-grid push. The record is
// deliberately clipped, so shape() is doing the damage on purpose.
// --------------------------------------------------------------
const kick = s("bd ~ ~ bd ~ bd ~ ~")
  .bank("RolandTR909")
  .gain(1.25)
  .shape(0.55)          // hard clip = the crushed Money Store kick
  .lpf(240)
  .distort("1.4:0.7")

// --------------------------------------------------------------
// LAYER 2 - SNARE
// Flat, dry, front-of-face backbeat. Tiny room only, no long tail.
// --------------------------------------------------------------
const snare = s("~ sd ~ sd")
  .bank("RolandTR909")
  .gain(1.1)
  .shape(0.4)
  .hpf(180)
  .room(0.12)
  .sometimesBy(0.2, x => x.stut(2, 0.6, 1/32))   // occasional flam/roll

// --------------------------------------------------------------
// LAYER 3 - HATS
// Machine 8ths, velocity swung by a sine so it breathes instead of
// sitting like a metronome.
// --------------------------------------------------------------
const hats = s("hh*8")
  .bank("RolandTR909")
  .gain(sine.range(0.3, 0.65).fast(2))
  .pan(sine.range(0.35, 0.65).slow(3))
  .sometimesBy(0.12, x => x.speed(2).gain(0.8))
  .hpf(6000)

// --------------------------------------------------------------
// LAYER 4 - SUB BASS
// The menace. Descending minor figure, sine sub only, no mids -
// everything above 130 Hz is the guitar/siren layer's job.
// --------------------------------------------------------------
const sub = n("0 ~ 0 0 ~ 2 ~ -1")
  .scale("e1:minor")
  .s("sine")
  .attack(0.005).decay(0.12).sustain(0.5).release(0.15)
  .lpf(130)
  .gain(0.95)
  .shape(0.25)

// --------------------------------------------------------------
// LAYER 5 - HOOK / VOCAL CHOP
// Stand-in for the chopped, pitched-up vocal loop that carries the
// hook. \`numbers\` is a spoken-word bank, so pitched up it reads as
// a vocal stab. Swap s("numbers") for your own sample bank later.
// --------------------------------------------------------------
const hook = n("0 0 ~ 0 0 ~ 3 ~")
  .s("numbers")
  .speed(1.7)           // pitch it up into that shrill register
  .gain(0.85)
  .crush(6)             // bit-crush = the tape-damaged texture
  .pan(0.45)
  .room(0.1)

// --------------------------------------------------------------
// LAYER 6 - SIREN / LEAD STAB
// The squealing sawtooth that answers the hook. Filter is swept by
// a slow sine so each stab opens differently.
// --------------------------------------------------------------
const siren = n("<0 ~ 2 ~ 0 -1 ~ ~>")
  .scale("e5:minor")
  .s("sawtooth")
  .lpf(sine.range(500, 4500).slow(4))
  .lpq(12)
  .attack(0.01).release(0.25)
  .gain(0.5)
  .delay(0.3).delaytime(1/8).delayfeedback(0.35)

// --------------------------------------------------------------
// LAYER 7 - NOISE / DEBRIS
// Industrial grit: filtered white noise bursts plus scrap metal.
// Keep it low - it is texture, not an instrument.
// --------------------------------------------------------------
const debris = stack(
  s("white*4").gain("0.25 0.1 0.2 0.1").hpf(2500).decay(0.05).sustain(0),
  s("~ ~ metal ~").gain(0.3).speed(rand.range(0.8, 1.6)).crush(5)
).degradeBy(0.35)

// ==============================================================
//  FULL MIX - comment a line out to solo/strip a layer
// ==============================================================
stack(
  kick,
  snare,
  hats,
  sub,
  hook,
  siren,
  debris
).postgain(0.9)

// ==============================================================
//  OPTIONAL ARRANGEMENT
//  Replace the stack() above with this for an intro/verse/hook form.
// ==============================================================
// arrange(
//   [4, stack(hook, debris)],                       // intro: loop alone
//   [8, stack(kick, snare, hats, sub, hook)],       // verse
//   [8, stack(kick, snare, hats, sub, hook, siren, debris)], // hook
//   [4, stack(sub, hook).degradeBy(0.4)]            // breakdown
// ).postgain(0.9)`,
  },
];
