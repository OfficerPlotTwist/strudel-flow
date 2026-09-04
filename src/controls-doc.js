/**
 * Every binding in the app, as data.
 *
 * A reference sheet is only worth having if it is TRUE, and a hand-kept one
 * stops being true the first time someone adds a control and forgets. So this
 * is data rather than prose, and tests/controls-doc.test.js checks it against
 * the app: every `apc40.*` name main.js reacts to has to appear here, and
 * every name here has to be a control the device map actually has.
 *
 * It cannot check that the DESCRIPTIONS are right - nothing can - but it can
 * guarantee the sheet is never missing a control or inventing one.
 *
 * `mode` is what has to be true for the row to apply. That column carries most
 * of the value here: this surface re-scopes controls rather than adding them,
 * so "REC" means two different things and a sheet that listed it once would be
 * wrong half the time.
 */

export const KEYBOARD = [
  { group: 'Playing', rows: [
    ['Ctrl+Enter', 'Evaluate the active song and start it'],
    ['Ctrl+.', 'Stop everything'],
    ['Ctrl+m', 'Comment or uncomment every block in the selection'],
    ['F1 – F5', 'Hold to unmute block 1–5 of the active song'],
    ['Alt+1 … Alt+9', 'Hold to fold tab N into the mix'],
    ['Ctrl+Alt+1 … 9', 'Hold to play tab N on its own'],
  ] },
  { group: 'Moving around', rows: [
    ['Ctrl+PageUp / PageDown', 'Previous / next song tab'],
    ['Ctrl+i', 'Insert the selected library snippet'],
    ['Ctrl+e', 'Open the explainer window'],
  ] },
  { group: 'Ripping', rows: [
    ['F6', 'Rip the selection into the holding tab'],
    ['F7', 'Rip it into a new song tab'],
    ['F8', 'Rip it into the library'],
    ['F9', 'Rip it into whichever song is playing'],
  ] },
];

export const SURFACE = [
  { group: 'Transport', rows: [
    ['apc40.global.play', 'PLAY', 'Arm the selection to start', ''],
    ['apc40.global.stop', 'STOP', 'Arm the selection to stop', ''],
    ['apc40.global.crossfader', 'CROSSFADER', 'How many cycles until an armed change lands', ''],
    ['apc40.device.detail_view', 'DETAIL VIEW', 'Hold: play and stop act on the whole song', 'hold'],
  ] },
  { group: 'Browsing', rows: [
    ['apc40.global.cue_level', 'CUE LEVEL', 'Move the block cursor through the song', ''],
    ['apc40.global.rec', 'REC', 'Pin or release the block under the cursor', 'not in pattern build'],
    ['apc40.global.stop_all', 'STOP ALL CLIPS', 'Clear the block selection', ''],
    ['apc40.trackctl.knob7', 'TC 7', 'Library category', ''],
    ['apc40.trackctl.knob8', 'TC 8', 'Library row', ''],
    ['apc40.global.nudge_minus', 'NUDGE −', 'Previous library tab', ''],
    ['apc40.global.nudge_plus', 'NUDGE +', 'Next library tab', ''],
    ['apc40.global.left', 'BANK ◀', 'Previous song tab', ''],
    ['apc40.global.right', 'BANK ▶', 'Next song tab', ''],
    ['apc40.global.up', 'BANK ▲', 'Delete this song — three taps', ''],
    ['apc40.track1.clip1', 'CLIP ROW 1', 'Hold: play only the song tabs held', 'not in pattern build'],
  ] },
  { group: 'Building a block', rows: [
    ['apc40.trackctl.send_b', 'SEND B', 'Latch block build mode', ''],
    ['apc40.global.tap_tempo', 'TAP TEMPO', 'Add the browsed item to the block', 'SEND B on'],
    ['apc40.trackctl.pan', 'PAN', 'Latch: a finished block plays from the next cycle', ''],
    ['apc40.trackctl.send_a', 'SEND A', 'Cue the block being built to outputs 3/4', ''],
    ['apc40.trackctl.send_c', 'SEND C', 'Audition the highlighted sound once a beat', ''],
  ] },
  { group: 'Swapping a function', rows: [
    ['apc40.trackctl.knob6', 'TC 6', "Walk the cursor block's functions; the library follows", ''],
    ['apc40.global.tap_tempo', 'TAP TEMPO', 'Swap that function, or its argument, for the browsed pick', 'a function browsed'],
  ] },
  { group: 'Turning the numbers', rows: [
    ['apc40.device.knob1', 'DEVICE 1–8', "The cursor block's numeric arguments, eight per track", 'tracks 1–7'],
    ['apc40.device.knob1', 'DEVICE 1–2', 'Reverb send for this block, and the song’s one reverb size', 'track 8'],
    ['apc40.device.knob1', 'DEVICE 1–7', 'attack · decay · sustain · release · lpf · hpf · postgain', 'master'],
  ] },
  { group: 'Stepping a pattern', rows: [
    ['apc40.track1.clip5', 'CLIP ROW 5', 'Enter pattern build; the eight eighth-notes of the bar', ''],
    ['apc40.track1.clip4', 'CLIP ROW 4', 'Held with the pad below: the sixteenth after it', 'pattern build'],
    ['apc40.track1.clip1', 'CLIP ROW 1', 'Scale degree 1–8, while a step is held', 'pattern build'],
    ['apc40.track1.clip2', 'CLIP ROW 2', 'Held with the degree above: a semitone up — lit where that is an accidental', 'pattern build'],
    ['apc40.track1.clip3', 'CLIP ROW 3', 'How many cycles this segment repeats, 1–8', 'pattern build'],
    ['apc40.scene1', 'SCENE 1', 'Write a rest — every other step holds', 'pattern build'],
    ['apc40.scene3', 'SCENE 3', 'Duplicate the segment · twice: an empty one of the same length', 'pattern build'],
    ['apc40.trackctl.knob1', 'TC 1', 'Octave 3–9', 'pattern build'],
    ['apc40.global.rec', 'REC', 'Leave pattern build', 'pattern build'],
  ] },
  { group: 'The whole song', rows: [
    ['apc40.global.shift', 'SHIFT', 'Hold: the next knob changes the song, not a block', 'hold'],
    ['apc40.trackctl.knob2', 'SHIFT + TC 2', 'Spread the next tempo change over 0–32 cycles', 'SHIFT'],
    ['apc40.trackctl.knob3', 'SHIFT + TC 3', 'Tempo, 40–220 BPM', 'SHIFT'],
    ['apc40.trackctl.knob4', 'SHIFT + TC 4', 'Key, around the circle of fifths', 'SHIFT'],
  ] },
];

/** Every control name the sheet documents, deduplicated. */
export function documentedControls() {
  return [...new Set(SURFACE.flatMap((section) => section.rows.map(([name]) => name)))];
}
