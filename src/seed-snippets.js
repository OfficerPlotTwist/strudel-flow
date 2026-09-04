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
    name: 'get_got',
    kind: 'songs',
    code: `// Get Got - Death Grips, 87 BPM, g minor
// songsterr s1334391 r1779377, all 50 bars, 3 tracks

setcpm(87 / 4)

// intro tom stutter
const toms = s("[ht ~ ht mt ht ~ mt ~ ht mt ht ~ mt ~ ~ ~]*2")
  .bank("RolandTR909")
  .gain(0.9)
  .shape(0.35)

// verse kick, crashed downbeat
const kick = s("[bd,cr] ~ ~ bd ~ bd bd bd bd ~ ~ bd ~ bd bd bd")
  .bank("RolandTR909")
  .gain(1.2)
  .shape(0.55)
  .lpf(260)

// verse open hats
const openHats = s("~ ~ oh ~ oh ~ oh ~ oh ~ oh ~ oh ~ oh ~")
  .bank("RolandTR909")
  .gain(0.45)
  .hpf(4000)
  .pan(sine.range(0.4, 0.6).slow(3))

// verse backbeat snare
const snare = s("~ sd ~ sd")
  .bank("RolandTR909")
  .gain(1.05)
  .shape(0.4)
  .hpf(180)
  .room(0.12)

// chorus kick
const tomKick = s("bd ~ ~ bd ~ bd ~ ~ bd ~ ~ bd ~ bd ~ bd")
  .bank("RolandTR909")
  .gain(1.15)
  .shape(0.5)
  .lpf(260)

// chorus displaced snare
const tomSnare = s("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ sd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ sd ~ ~ sd ~ ~ ~")
  .bank("RolandTR909")
  .gain(1.0)
  .shape(0.4)
  .hpf(180)

// bass voice, g minor
// 0=G1 1=A1 2=Bb1 4=D2 6=F2 7=G2 8=A2 9=Bb2
const bassVoice = (p) => p
  .scale("g1:minor")
  .s("sawtooth")
  .lpf(perlin.range(220, 780).slow(6))
  .lpq(9)
  .attack(0.002).decay(0.09).sustain(0.2).release(0.05)
  .shape(0.4)
  .gain(0.85)

// verse bass, seven bars
const bass = bassVoice(n("<4*16 4*16 [1*4 0*4 1*4 0*4] [9 8 8 7]*4 [7*8 8*8] 6*16 6*16>"))

// pedal bass, three sections
const bassG = bassVoice(n("0*16"))
const bassBb = bassVoice(n("2*16"))
const bassF = bassVoice(n("6*16"))

// alternating chorus bass
const bassAlt = bassVoice(n("[8 7]*8"))
const bassAB = bassVoice(n("[8 9]*8"))

// late bass figure
const bassFig = bassVoice(n("[7 ~ ~ 9 9 ~ 9 ~]*2"))

// octave-down sub
const sub = (b) => b
  .add(note(-12))
  .s("sine")
  .lpf(140).lpq(1).shape(0.15).gain(0.9)

// distorted guitar siren
// g4 minor: 0=G4 1=A4 2=Bb4
const siren = n("[1*4 2*4 1*4 0*4]*2")
  .scale("g4:minor")
  .s("sawtooth")
  .superimpose(x => x.add(note(0.13)).gain(0.6))
  .lpf(sine.range(900, 4200).slow(4))
  .lpq(12)
  .attack(0.001).decay(0.07).sustain(0).release(0.04)
  .crush(9)
  .gain(0.5)

// chorus hook melody
// hooktheory notates 175 BPM, double songsterr's 87, so
// its bar is half a cycle here - hence fast(2).
// d4 minor: 0=D4 2=F4 3=G4 4=A4
const hook = n("4 [3 0] [4 3 0] [4 2 0 ~]")
  .scale("d4:minor")
  .fast(2)
  .s("square")
  .attack(0.005).decay(0.2).sustain(0.25).release(0.2)
  .lpf(3200)
  .crush(7)
  .delay(0.35).delaytime(0.2586).delayfeedback(0.35)
  .room(0.25)
  .gain(0.45)

// verse loop
const verse = stack(kick, snare, openHats)
// chorus loop
const chorus = stack(tomKick, tomSnare, toms)

// full mix
stack(verse, bass, sub(bass), siren).postgain(0.5)

// arrangement, all fifty bars
// arrange(
//   [2,  toms],                                  // m01-02
//   [3,  stack(verse, bass, sub(bass), siren)],  // m03-05
//   [4,  stack(verse, bass, sub(bass))],         // m06-09
//   [1,  verse],                                 // m10
//   [2,  chorus],                                // m11-12
//   [4,  verse],                                 // m13-16
//   [2,  stack(toms, bassG)],                    // m17-18
//   [2,  stack(verse, bassG, sub(bassG))],       // m19-20
//   [4,  stack(chorus, hook)],                   // m21-24
//   [2,  stack(verse, bassBb, sub(bassBb))],     // m25-26
//   [3,  stack(verse, bassAlt, sub(bassAlt))],   // m27-29
//   [2,  stack(chorus, hook)],                   // m30-31
//   [1,  stack(toms, bassF)],                    // m32
//   [3,  verse],                                 // m33-35
//   [1,  stack(chorus, bassAB)],                 // m36
//   [4,  verse],                                 // m37-40
//   [2,  toms],                                  // m41-42
//   [2,  stack(chorus, bassFig, sub(bassFig))],  // m43-44
//   [3,  verse],                                 // m45-47
//   [2,  stack(chorus, hook)]                    // m48-49
// ).postgain(0.5)`,
  },
];
