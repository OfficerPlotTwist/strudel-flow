/**
 * The starter snippet collection, in code so it can be merged into the user's
 * library at load time (see seedLibrary in storage.js). Pure data - no DOM, no
 * @strudel/*.
 *
 * Every entry here is a BLOCK, not a song, and that constrains what may be in
 * one:
 *
 *   - exactly one `$:` pattern, so it can be dropped beside other blocks
 *   - NO `setcpm`/`setcps` - tempo belongs to the song you insert it into, and
 *     a snippet that sets it would silently re-tempo the whole set
 *   - no `stack(...)` of parts - that is a song; split it into blocks instead
 *
 * Categories are the four roles a block plays in an arrangement: `beat` is the
 * rhythm, `pads` the sustained harmony underneath, `synths` the bass and lead
 * voices, `melodies` the line on top.
 *
 * Every snippet in this file is verified to evaluate in a real browser by
 * scripts/verify-snippets.mjs - a snippet that does not parse is worse than no
 * snippet, because it fails inside the user's song.
 */
export const SEED_BLOCKS = [
  // ---------------------------------------------------------------- beat ---
  {
    name: 'four_on_floor',
    category: 'beat',
    code: `$: s("bd*4").bank("RolandTR909").gain(0.9)`,
  },
  {
    name: 'boom_bap',
    category: 'beat',
    code: `$: s("bd ~ ~ bd ~ ~ sd ~").bank("RolandTR808").gain(0.95)`,
  },
  {
    name: 'breakbeat',
    category: 'beat',
    code: `$: s("bd ~ sd bd ~ bd sd ~").bank("RolandTR909").gain(0.9).shape(0.2)`,
  },
  {
    name: 'hats_16ths',
    category: 'beat',
    code: `$: s("hh*16")
  .bank("RolandTR909")
  .gain("[0.4 0.22 0.3 0.22]*4")
  .pan(sine.range(0.35, 0.65))`,
  },
  {
    name: 'hats_swung',
    category: 'beat',
    code: `$: s("hh*8").bank("RolandTR808").gain(0.35).degradeBy(0.15)`,
  },
  {
    name: 'clap_backbeat',
    category: 'beat',
    code: `$: s("~ cp ~ cp").bank("RolandTR909").gain(0.7).room(0.25)`,
  },
  {
    name: 'rim_ticks',
    category: 'beat',
    code: `$: s("~ ~ rim ~ ~ rim ~ ~").bank("RolandTR707").gain(0.5).room(0.3)`,
  },
  {
    name: 'ride_pulse',
    category: 'beat',
    code: `$: s("oh ~ oh ~ oh ~ oh ~").bank("RolandTR909").gain(0.28).pan(0.6)`,
  },
  {
    name: 'euclid_kick',
    category: 'beat',
    code: `$: s("bd(3,8)").bank("RolandTR808").gain(0.95)`,
  },
  {
    name: 'euclid_perc',
    category: 'beat',
    // `rim`, not `perc`: "perc" is not a registered sound in any bank the app
    // prebakes, so it parsed cleanly and played nothing at all. Caught by the
    // audio gate in scripts/verify-snippets.mjs, not by any unit test.
    code: `$: s("rim(5,16)").bank("RolandTR808").gain(0.5).pan(rand.range(0.3, 0.7)).room(0.35)`,
  },
  {
    name: 'toms_roll',
    category: 'beat',
    code: `$: s("~ ~ ~ [lt mt ht]").bank("RolandTR909").gain(0.6).room(0.3)`,
  },
  {
    name: 'ghost_snare',
    category: 'beat',
    code: `$: s("sd*8").bank("RolandTR909").gain("0.12 0.05 0.9 0.05").degradeBy(0.3)`,
  },

  // ---------------------------------------------------------------- pads ---
  {
    name: 'warm_minor_pad',
    category: 'pads',
    code: `$: n("<[0,2,4] [-2,0,2] [-4,-2,0] [-3,-1,1]>")
  .scale("c3:minor")
  .s("sawtooth")
  .lpf(700)
  .attack(1.2).release(2.5)
  .gain(0.35)
  .room(0.7)`,
  },
  {
    name: 'glass_pad',
    category: 'pads',
    code: `$: n("<[0,4,7] [-1,3,6]>")
  .scale("e3:minor")
  .s("triangle")
  .attack(2).release(3)
  .lpf(2400)
  .gain(0.28)
  .room(0.85).roomsize(6)`,
  },
  {
    name: 'breathing_pad',
    category: 'pads',
    code: `$: n("<[0,2,4] [-2,0,2]>")
  .scale("a2:minor")
  .s("sawtooth")
  .lpf(sine.range(300, 1400).slow(8))
  .attack(1.5).release(2)
  .gain(0.3)
  .room(0.6)`,
  },
  {
    name: 'organ_bed',
    category: 'pads',
    code: `$: n("<[0,4,7] [-1,3,6]>")
  .scale("c3:minor")
  .s("gm_drawbar_organ")
  .attack(0.4).release(1.2)
  .gain(0.3)
  .room(0.5)`,
  },
  {
    name: 'string_swell',
    category: 'pads',
    code: `$: n("<[1,3,5] [0,2,4]>")
  .scale("c3:major")
  .s("gm_string_ensemble_1")
  .attack(2.5).release(3)
  .gain(0.32)
  .room(0.75)`,
  },
  {
    name: 'detuned_pad',
    category: 'pads',
    code: `$: n("<[1,3,5] [0,2,4]>")
  .scale("eb3:major")
  .s("sawtooth")
  .superimpose(x => x.add(note(0.12)).gain(0.5))
  .lpf(900)
  .attack(1).release(2.5)
  .gain(0.3)
  .room(0.65)`,
  },
  {
    name: 'sub_drone',
    category: 'pads',
    code: `$: n("<0 0 -2 -1>")
  .scale("c2:minor")
  .s("sine")
  .attack(1.5).release(3)
  .gain(0.4)
  .slow(2)`,
  },
  {
    name: 'shimmer_pad',
    category: 'pads',
    code: `$: n("<[0,2,4] [-2,0,2]>")
  .scale("g3:major")
  .s("triangle")
  .superimpose(x => x.add(note(12)).gain(0.25))
  .attack(1.8).release(3)
  .gain(0.26)
  .room(0.9).roomsize(8)`,
  },
  {
    name: 'dusty_pad',
    category: 'pads',
    code: `$: n("<[0,2,4] [-1,1,3]>")
  .scale("a2:phrygian")
  .s("square")
  .lpf(600).lpq(4)
  .crush(7)
  .attack(1).release(2)
  .gain(0.25)
  .room(0.55)`,
  },
  {
    name: 'suspended_pad',
    category: 'pads',
    code: `$: n("<[0,3,4] [-1,2,3]>")
  .scale("d3:dorian")
  .s("sawtooth")
  .lpf(1100)
  .attack(1.4).release(2.2)
  .gain(0.3)
  .room(0.7)
  .pan(sine.range(0.4, 0.6).slow(6))`,
  },
  {
    name: 'choir_pad',
    category: 'pads',
    code: `$: n("<[0,2,4] [-2,0,2]>")
  .scale("c4:major")
  .s("gm_choir_aahs")
  .attack(1.5).release(2.5)
  .gain(0.3)
  .room(0.8)`,
  },
  {
    name: 'tape_pad',
    category: 'pads',
    code: `$: n("<[0,2,4] [-1,1,3]>")
  .scale("eb3:mixolydian")
  .s("sawtooth")
  .lpf(perlin.range(400, 1200).slow(10))
  .vib(0.4).vibmod(0.05)
  .attack(1.6).release(2.6)
  .gain(0.28)
  .room(0.7)`,
  },

  // -------------------------------------------------------------- synths ---
  {
    name: 'acid_bass',
    category: 'synths',
    code: `$: n("0 0 2 0 -3 0 -1 0")
  .scale("c2:minor")
  .s("sawtooth")
  .lpf(perlin.range(200, 1800).slow(4)).lpq(12)
  .attack(0.005).decay(0.12).sustain(0.2).release(0.05)
  .shape(0.35)
  .gain(0.7)`,
  },
  {
    name: 'sub_bass',
    category: 'synths',
    code: `$: n("<0 ~ ~ 0 ~ ~ 2 ~>")
  .scale("c2:minor")
  .s("sine")
  .attack(0.005).decay(0.2).sustain(0.5).release(0.15)
  .gain(0.9)`,
  },
  {
    name: 'reese_bass',
    category: 'synths',
    code: `$: n("<0 0 2 4>")
  .scale("f1:minor")
  .s("sawtooth")
  .superimpose(x => x.add(note(0.15)))
  .lpf(500).lpq(6)
  .attack(0.01).release(0.2)
  .gain(0.65)`,
  },
  {
    name: 'pluck_stab',
    category: 'synths',
    code: `$: n("[0,2,4] ~ ~ [-1,1,3]")
  .scale("c4:minor")
  .s("square")
  .attack(0.002).decay(0.14).sustain(0).release(0.1)
  .lpf(2200)
  .gain(0.4)
  .room(0.3)`,
  },
  {
    name: 'saw_lead',
    category: 'synths',
    code: `$: n("0 2 4 6")
  .scale("c5:minor")
  .s("sawtooth")
  .lpf(sine.range(1200, 4000).slow(4)).lpq(8)
  .attack(0.01).decay(0.1).sustain(0.3).release(0.2)
  .gain(0.4)
  .delay(0.3).delaytime(0.25).delayfeedback(0.4)`,
  },
  {
    name: 'fm_bell',
    category: 'synths',
    code: `$: n("<0 -3 2 -1>")
  .scale("c5:minor")
  .s("sine")
  .fm(4).fmh(2.01)
  .attack(0.002).decay(0.6).sustain(0).release(0.4)
  .gain(0.35)
  .room(0.6)`,
  },
  {
    name: 'bitcrush_stab',
    category: 'synths',
    code: `$: n("[0,2,4]*2")
  .scale("f4:minor")
  .s("square")
  .crush(6)
  .attack(0.001).decay(0.1).sustain(0).release(0.05)
  .gain(0.35)`,
  },
  {
    name: 'wobble_bass',
    category: 'synths',
    code: `$: n("<0 0 -1 2>")
  .scale("c2:minor")
  .s("sawtooth")
  .lpf(sine.range(150, 2000).fast(2)).lpq(14)
  .attack(0.005).release(0.1)
  .gain(0.6)
  .shape(0.25)`,
  },
  {
    name: 'square_arp_voice',
    category: 'synths',
    code: `$: n("0 2 4 7 4 2")
  .scale("c4:minor")
  .s("square")
  .attack(0.002).decay(0.08).sustain(0).release(0.06)
  .lpf(3000)
  .gain(0.3)
  .pan(sine.range(0.3, 0.7))`,
  },
  {
    name: 'noise_sweep',
    category: 'synths',
    code: `$: s("white")
  .lpf(saw.range(200, 6000).slow(8))
  .attack(0.5).release(1.5)
  .gain(0.2)
  .slow(4)`,
  },
  {
    name: 'rhodes_chord',
    category: 'synths',
    code: `$: n("<[0,2,4,6] [-2,0,2,4]>")
  .scale("c4:major")
  .s("gm_electric_piano_1")
  .attack(0.01).release(1)
  .gain(0.35)
  .room(0.45)`,
  },
  {
    name: 'brass_hit',
    category: 'synths',
    code: `$: n("<[0,2,4] ~ ~ ~>")
  .scale("c4:major")
  .s("gm_brass_section")
  .attack(0.01).decay(0.3).sustain(0.2).release(0.3)
  .gain(0.4)
  .room(0.35)`,
  },

  // ------------------------------------------------------------ melodies ---
  {
    name: 'minor_arp',
    category: 'melodies',
    code: `$: n("0 2 4 7 4 2")
  .scale("c4:minor")
  .s("piano")
  .gain(0.5)
  .room(0.5)`,
  },
  {
    name: 'pentatonic_run',
    category: 'melodies',
    code: `$: n("0 2 4 6 8 6 4 2")
  .scale("a3:majPent")
  .s("triangle")
  .attack(0.01).release(0.3)
  .gain(0.35)
  .delay(0.25).delaytime(0.125)`,
  },
  {
    name: 'dorian_line',
    category: 'melodies',
    code: `$: n("<0 3 5 4> <2 4 7 5>")
  .scale("d4:dorian")
  .s("gm_electric_piano_1")
  .gain(0.4)
  .room(0.5)`,
  },
  {
    name: 'sparse_hook',
    category: 'melodies',
    code: `$: n("<0 ~ ~ 2> <4 ~ 3 2>")
  .scale("f5:minor")
  .s("triangle")
  .attack(0.01).decay(0.3).sustain(0.3).release(0.4)
  .gain(0.4)
  .delay(0.4).delaytime(0.1875).delayfeedback(0.4)
  .room(0.5)`,
  },
  {
    name: 'call_response',
    category: 'melodies',
    code: `$: n("<[0 0 ~ ~] [~ ~ 4 4] [2 2 ~ ~] [~ ~ 0 ~]>")
  .scale("c5:minor")
  .s("square")
  .attack(0.005).decay(0.12).sustain(0).release(0.1)
  .lpf(3200)
  .gain(0.32)`,
  },
  {
    name: 'generative_line',
    category: 'melodies',
    code: `$: n(irand(8).segment(8))
  .scale("e4:minor")
  .s("piano")
  .degradeBy(0.35)
  .gain(0.4)
  .room(0.6)`,
  },
  {
    name: 'octave_jumps',
    category: 'melodies',
    code: `$: n("0 7 2 9 4 11 6 13")
  .scale("c4:minor")
  .s("sawtooth")
  .lpf(2600)
  .attack(0.005).decay(0.1).sustain(0).release(0.08)
  .gain(0.3)
  .pan("0.35 0.65")`,
  },
  {
    name: 'slow_melody',
    category: 'melodies',
    code: `$: n("<0 2 4 3>")
  .scale("d4:minor")
  .slow(2)
  .s("gm_flute")
  .attack(0.1).release(0.6)
  .gain(0.4)
  .room(0.7)`,
  },
  {
    name: 'chromatic_walk',
    category: 'melodies',
    code: `$: n("0 1 2 3 4 3 2 1")
  .scale("c4:chromatic")
  .s("triangle")
  .attack(0.005).release(0.15)
  .gain(0.3)
  .lpf(2800)`,
  },
  {
    name: 'bell_motif',
    category: 'melodies',
    code: `$: n("0 ~ 4 ~ 7 ~ 4 ~")
  .scale("g4:major")
  .s("gm_music_box")
  .gain(0.45)
  .room(0.8).roomsize(5)`,
  },
  {
    name: 'jux_melody',
    category: 'melodies',
    code: `$: n("0 3 5 7 5 3")
  .scale("a4:minor")
  .s("triangle")
  .jux(rev)
  .gain(0.32)
  .room(0.55)`,
  },
  {
    name: 'question_phrase',
    category: 'melodies',
    code: `$: n("<[0 2 4 ~] [4 2 0 ~] [0 4 7 ~] [7 4 2 0]>")
  .scale("f4:lydian")
  .s("piano")
  .gain(0.42)
  .room(0.5)
  .delay(0.2).delaytime(0.375)`,
  },
];
