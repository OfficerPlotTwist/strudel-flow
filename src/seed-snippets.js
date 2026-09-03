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
    code: `// ==============================================================
//  GET GOT  --  Death Grips (The Money Store, 2012)
//  Transcribed from source, not from ear:
//    drums/bass/gtr : songsterr.com tab s1334391 rev 1779377
//    key + hook     : hooktheory theorytab death-grips/get-got
//  Both sources agree on tempo: 175 BPM (the half-time feel is
//  87.5) in 4/4.  Key: D minor for the hook; the intro riff is
//  notated C mixolydian (C against Bb).
//  1 cycle = 1 bar.  Ctrl+Enter to play, Ctrl+. to stop.
// ==============================================================

setcpm(175 / 4)

// --------------------------------------------------------------
// TOMS - the intro figure (tab m1-2, m17-18, m32, m41-42).
// Hi-mid tom (48) and low-mid tom (47) on a 32nd grid. No kick,
// no snare: this is the bare stutter that opens the record.
// --------------------------------------------------------------
const toms = s("ht ~ ht mt ht ~ mt ~ ht mt ht ~ mt ~ ~ ~ ht ~ ht mt ht ~ mt ~ ht mt ht ~ mt ~ ~ ~")
  .bank("RolandTR909")
  .gain(0.9)
  .shape(0.35)

// --------------------------------------------------------------
// MAIN GROOVE - the verse beat (tab m3-9).
// Kick is the busy part: 16ths at 0 3 5 6 7 8 11 13 14 15.
// Open hat rides straight 8ths, snare is a plain 2-and-4.
// --------------------------------------------------------------
const kick = s("bd ~ ~ bd ~ bd bd bd bd ~ ~ bd ~ bd bd bd")
  .bank("RolandTR909")
  .gain(1.2)
  .shape(0.55)          // the record is clipped on purpose
  .lpf(260)

const openHats = s("oh*8")
  .bank("RolandTR909")
  .gain(0.45)
  .hpf(4000)
  .pan(sine.range(0.4, 0.6).slow(3))

const snare = s("~ sd ~ sd")
  .bank("RolandTR909")
  .gain(1.05)
  .shape(0.4)
  .hpf(180)
  .room(0.12)

// --------------------------------------------------------------
// TOM GROOVE - the chorus beat (tab m11-12, m21-24, m30-31).
// Same tom figure as the intro, with the kick and a displaced
// snare (12.5 and 14 in 16ths) underneath.
// --------------------------------------------------------------
const tomKick = s("bd ~ ~ ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ ~ ~ bd ~ ~ ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ bd ~")
  .bank("RolandTR909")
  .gain(1.15)
  .shape(0.5)
  .lpf(260)

const tomSnare = s("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ sd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ sd ~ ~ sd ~ ~ ~")
  .bank("RolandTR909")
  .gain(1.0)
  .shape(0.4)
  .hpf(180)

// --------------------------------------------------------------
// BASS - literal pitches from the bass tab, 16ths throughout.
// One bar per angle bracket:
//   G2 | G2 | D2/C2 | Eb3 D3 D3 C3 | C3 -> D3 | Bb2 | Bb2
// Written in D phrygian so bar 4's Eb is a scale degree, not an
// accidental: 0=D2  3=G2  5=Bb2  6=C3  7=D3  8=Eb3.
// --------------------------------------------------------------
const bass = n("<3*16 3*16 [0*4 -1*4 0*4 -1*4] [8 7 7 6]*4 [6*8 7*8] 5*16 5*16>")
  .scale("d2:phrygian")
  .s("sawtooth")
  .lpf(perlin.range(220, 780).slow(6))
  .lpq(9)
  .attack(0.002).decay(0.09).sustain(0.2).release(0.05)
  .shape(0.4)
  .gain(0.85)

// Sub underneath, same notes an octave down, no character at all.
const sub = bass
  .add(note(-12))
  .s("sine")
  .lpf(140).lpq(1).shape(0.15).gain(0.9)

// Chorus bass (tab m27-29): D3/C3 alternating 16ths.
const bassChorus = n("[0 -1]*8")
  .scale("d3:minor")
  .s("sawtooth")
  .lpf(700).lpq(9)
  .attack(0.002).decay(0.09).sustain(0.2).release(0.05)
  .shape(0.4).gain(0.85)

// --------------------------------------------------------------
// SIREN - the distortion-guitar riff from the tab (m3-5).
// C#5 D5 C#5 B4, each hammered as four 32nds. The semitone
// wobble against a D-minor centre is what makes it scream.
// --------------------------------------------------------------
const siren = n("[1*4 2*4 1*4 0*4]*2")
  .scale("b4:minor")          // 0=B4 1=C#5 2=D5
  .s("sawtooth")
  .superimpose(x => x.add(note(0.13)).gain(0.6))   // detune twin
  .lpf(sine.range(900, 4200).slow(4))
  .lpq(12)
  .attack(0.001).decay(0.07).sustain(0).release(0.04)
  .crush(9)
  .gain(0.5)

// --------------------------------------------------------------
// HOOK - the theorytab chorus melody, D minor, range D4-A4.
// A | G D | A G D (triplet) | A F D
// --------------------------------------------------------------
const hook = n("4 [3 0] [4 3 0] [4 2 0 ~]")
  .scale("d4:minor")         // 0=D4 2=F4 3=G4 4=A4
  .s("square")
  .attack(0.005).decay(0.2).sustain(0.25).release(0.2)
  .lpf(3200)
  .crush(7)
  .delay(0.35).delaytime(0.1029).delayfeedback(0.35)  // dotted 8th at 175
  .room(0.25)
  .gain(0.45)

// ==============================================================
//  FULL MIX - comment a line out to strip a layer
// ==============================================================
stack(
  kick,
  snare,
  openHats,
  sub,
  bass,
  siren,
  hook
).postgain(0.4)          // seven loud layers - this is the headroom

// ==============================================================
//  ARRANGEMENT - follows the tab's section order.
//  Replace the stack() above with this.
// ==============================================================
// arrange(
//   [2, toms],                                                // intro m1-2
//   [7, stack(kick, snare, openHats, sub, bass, siren)],       // verse m3-9
//   [2, stack(tomKick, tomSnare, toms, sub, bass)],            // m11-12
//   [4, stack(kick, snare, openHats, sub, bass, hook)],        // m13-16
//   [2, toms],                                                // m17-18
//   [4, stack(tomKick, tomSnare, toms, bassChorus, hook)],     // chorus
//   [2, stack(sub, bassChorus).degradeBy(0.4)]                 // breakdown
// ).postgain(0.9)`,
  },
];
