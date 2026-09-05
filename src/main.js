import {
  audioContext,
  getTransport,
  initEngine,
  previewSound,
  setTransportCps,
  unlockAudio,
} from './engine.js';
import { LED, enableMidi, listInputs, listOutputs, onMidiMessage, sendCC, sendNote } from './midi.js';
import { createEditorPane } from './editor.js';
import { createLive } from './live.js';
import { isStandaloneBlock } from './blocks.js';
import { showBootScreen } from './ui/boot.js';
import { createLibraryPanel } from './ui/panel.js';
import { createStatus } from './ui/status.js';
import { createSettings } from './ui/settings.js';
import { createMidiMonitor } from './ui/midi-monitor.js';
import { createDeviceMap } from './device-map.js';
import { createRelativeBank } from './relative.js';
import { createBlockCursor, createStepper } from './browse.js';
import {
  MASTER_CONTROLS,
  MASTER_TRACK,
  PART_TRACKS,
  REVERB_CONTROLS,
  REVERB_TRACK,
  argRows,
  assignArgSlots,
  bindFixedControls,
  callText,
  findNumericArgs,
} from './args.js';
import { busSizeSpan, ensureBus, hasBus } from './bus.js';
import {
  BPM_RANGE,
  RAMP_RANGE,
  bpmToCps,
  clampBpm,
  clampRamp,
  rampBpm,
  rampProgress,
  setSongBpm,
  songBpm,
} from './tempo.js';
import { blockFunctions, replacementFor, stepFunction } from './fn-browse.js';
import {
  COLUMNS,
  OCTAVE_RANGE,
  accidentalDegrees,
  addSegment,
  blockSuffix,
  canStepInto,
  createPattern,
  nextKey,
  describeKey,
  makeActiveEmpty,
  parsePattern,
  patternBlock,
  setOctave,
  setRepeats,
  setRest,
  setSongKey,
  setStep,
  songKey,
  stepIndex,
} from './pattern-build.js';
import { createArgKnobs, deviceKnobIndex } from './arg-knobs.js';
import { addToBlock, classifyItem, setupLine } from './build.js';
import { DEFAULT_MONITOR_CHANNELS, splitStatus, toMonitor } from './monitor.js';
import { createAudition } from './audition.js';
import { crossfaderCycles } from './arm.js';
import { createExplainerWindow } from './ui/explainer-window.js';
import { createActions } from './actions.js';
import {
  defaultHoldSlots,
  defaultTriggerMap,
  keyEventToTrigger,
  midiDataToHold,
  midiDataToTrigger,
  resolveAction,
  resolveHold,
  resolveTabHold,
  tabHoldBindings,
  createTapGate,
} from './triggers.js';

const status = createStatus(document.getElementById('status-strip'));

const pane = createEditorPane(document.getElementById('editor-pane'));

// Called before the gesture, on purpose. See engine.js. onDraw feeds one
// shared per-frame loop; it only ever reads state, never evaluates.
initEngine({
  onError: (msg) => status.error(msg),
  onDraw: (haps, time) => pane.highlight(haps, time),
});
// An empty sheet. The app opens on a song holding nothing but its reverb bus
// (addTab adds that), because the first thing a performer does is decide what
// goes there - and demo content is something to delete before you can start,
// every single launch.
const first = pane.addTab('song-1', '');

// Everything that reaches the parser goes through `live`: it composes the
// active tab with whatever blocks and tabs are being held down right now.
const live = createLive({ pane });
const explainer = createExplainerWindow(pane);

const panel = createLibraryPanel(document.getElementById('library-pane'), {
  onInsert: (code, kind, name) => {
    if (kind === 'songs') {
      // A saved song opens as its own page - it does not get pasted into
      // whatever tab happens to be open. Viewing it does not evaluate it;
      // the user still presses Ctrl+Enter to make it live.
      pane.viewTab(pane.addTab(name, code));
    } else if (isStandaloneBlock(code)) {
      // A whole pattern goes in as its own block. Splicing it at the caret is
      // how the library used to produce syntax errors on every insert that
      // did not happen to land on a blank line.
      focusNewBlock(pane.getViewedId(), pane.insertAsBlock(code));
    } else {
      // A fragment (.gain(0.5), s("bd")) is meant to chain onto what is
      // already under the caret, so it goes exactly where the caret is.
      pane.insertAtCursor(code);
    }
  },
  getSongCode: () => pane.getCode(pane.getViewedId()),
  getSongName: () => pane.getTabs().find((t) => t.id === pane.getViewedId()).name,
});

// An edit re-renders what is ALREADY playing; it never starts playback.
pane.onActiveEdit(() => live.refresh());

const triggerMap = defaultTriggerMap();
let holdSlots = defaultHoldSlots();
let tabHoldOverrides = {};
// The MIDI input that drives the APP (tabs, holds, actions), as opposed to the
// ports carrying pattern signal in and out. Never both.
let controlPort = null;

// Names the controls of a mapped surface, so a binding can say
// `apc40.track3.clip1` instead of `note:55` - which on this surface is the
// same message as clip 1 on seven other tracks. See device-map.js.
const device = createDeviceMap();

/**
 * A REBIND button in settings waits here for the next control the user
 * touches, which is the only way to bind one without knowing its number.
 *
 * Presses only, and only buttons: a fader has no press, and an action bound to
 * one would fire on every message of a sweep.
 */
let pendingControlCapture = null;
function captureControl(control) {
  if (!pendingControlCapture || control.isDown !== true) return false;
  const capture = pendingControlCapture;
  pendingControlCapture = null;
  capture(control.name);
  return true;
}
const currentTabHolds = () => tabHoldBindings(pane.getTabs(), tabHoldOverrides);

// ---- browsing from the control surface ------------------------------------
//
// The cue encoder scrolls a cursor over the blocks of the song on screen, REC
// pins the block under it, and the pinned set plus the cursor IS the editor's
// selection - written back as a multi-range selection rather than kept in a
// private set beside it. That is what lets the play/stop buttons, the rip
// keys and Ctrl+M all act on what the knob chose without knowing it exists.
const blockCursor = createBlockCursor();

/**
 * Put the block cursor on a block that has just been created.
 *
 * The selection and the block cursor are two different things: selecting a
 * block shows it, but the cue encoder keeps its own position, so without this
 * the next turn of the encoder jumps back to wherever it was and drags the
 * eight knobs with it. A block that was just made is where attention is, and
 * the cursor has to agree.
 *
 * Pins are left alone - they were deliberate, and a new block should join the
 * selection rather than clear it.
 */
function focusNewBlock(id, index) {
  if (index === null || index === undefined || index < 0) return;
  blockCursor.moveTo(index);
  showBlockSelection();
}

/** Push the cursor's choice into the editor, so it is visible and actionable. */
function showBlockSelection() {
  const id = pane.getViewedId();
  if (!id) return;
  const indexes = blockCursor.indexes(pane.getBlockCount(id));
  if (indexes.length === 0) return;
  // The cursor block goes LAST so it becomes the main range and the view
  // scrolls to it rather than to whichever pinned block sorts last.
  const ordered = [...indexes.filter((i) => i !== blockCursor.cursor), blockCursor.cursor];
  pane.selectBlocks(id, ordered);
}

// ---- the eight device knobs over one block's numbers ----------------------
//
// With exactly ONE block selected, its knobbable numeric arguments are dealt
// across the nine track selects and the eight device knobs: track 1 knobs 1-8
// are arguments 1-8, track 2 knobs 1-8 are 9-16, and so on to master. The
// address of each is printed under the number it drives (see ui/arg-map.js),
// so the binding is readable at the argument rather than memorised.
//
// One block only, on purpose. The addressing is positional, and a second
// selected block would renumber every argument in the first the moment it was
// pinned - a control surface whose meaning changes underneath a held knob.
const argKnobs = createArgKnobs({
  send: (channel, cc, value) => sendCC(device.outPort, channel, cc, value),
  apply: (slot, value, text) => {
    const id = pane.getViewedId();
    if (!id) return;
    // Three kinds of write, and they differ in WHERE the number lives rather
    // than in what turning the knob means.
    if (slot.shared) {
      // The reverb bus: one size for the whole song, because there is one
      // reverb per orbit. Written to the bus statement, never to a block.
      const span = busSizeSpan(pane.getCode(id));
      if (!span) return;
      pane.replaceRange(id, span.from, span.to, text, { notify: false });
    } else if (slot.virtual) {
      // The block does not call this yet. Writing it is what creates it, so
      // the master knobs mean the same thing on a block that never asked for
      // an envelope as on one that did.
      const block = pane.getBlockAt(id, cursorBlockIndex());
      if (!block) return;
      pane.replaceRange(id, block.to, block.to, callText(slot, text), { notify: false });
    } else {
      pane.replaceRange(id, slot.from, slot.to, text, { notify: false });
    }
    // The document is written on every message - the number under the knob has
    // to move with the hand. The PARSER is told on the trailing edge.
    scheduleArgRefresh();
    status.info(`${slot.track}/${slot.knob} ${slot.label ?? slot.fn} ${text}`);
  },
});

/**
 * Which block the knobs are on.
 *
 * The selection can hold several blocks; the knobs can only edit one, and it
 * is the one under the browse cursor. With no surface selection at all - a
 * plain mouse click - the sole selected block is the cursor block, because
 * there is nothing else it could be.
 */
function cursorBlockIndex() {
  const id = pane.getViewedId();
  if (!id) return null;
  const selected = pane.getSelectedBlocks(id);
  if (selected.length === 0) return null;
  if (selected.length === 1) return selected[0].index;
  const cursor = selected.find((block) => block.index === blockCursor.cursor);
  // The cursor can sit outside the selection after an edit shortened the song;
  // fall back to the first selected block rather than addressing nothing.
  return (cursor ?? selected[0]).index;
}

/** How long a knob has to stop moving before the set is re-rendered. */
const ARG_REFRESH_MS = 120;
let argRefreshTimer = null;

/**
 * Re-render the set after a knob sweep settles, once.
 *
 * These pots emit up to two hundred messages a second, and every one of them
 * edits the document. Re-rendering per message would queue two hundred
 * transpiles a second behind each other - live.js serialises evaluations, so
 * they do not overlap, they PILE UP, and the surface goes deaf under the
 * backlog while MIDI keeps arriving. Coalescing on the trailing edge is what
 * makes a sweep cost one re-render instead of one per step; the audible
 * parameter still lands within a frame or two of the hand stopping.
 */
function scheduleArgRefresh() {
  if (argRefreshTimer) return;
  argRefreshTimer = setTimeout(() => {
    argRefreshTimer = null;
    live.refresh();
  }, ARG_REFRESH_MS);
}

/** What the current arg map is OF, so an edit to a value is not a new block. */
let argSignature = null;

/**
 * Recompute the knob map for whatever single block is selected, and draw it.
 *
 * Called on every caret move and every document change, which is also every
 * knob write. The signature is what keeps that cheap: when the same arguments
 * of the same block are still on the knobs, the slots are swapped in silently
 * and the hardware is left alone. Only a genuinely different block re-parks
 * the eight pots.
 */
function refreshArgMap() {
  const id = pane.getViewedId();
  const index = id ? cursorBlockIndex() : null;
  const block = index === null ? null : pane.getBlockAt(id, index);
  if (!block) {
    argSignature = null;
    argKnobs.clear();
    if (id) {
      pane.setArgMap(id, null);
      pane.setCursorBlock(id, null);
    }
    return;
  }

  // The bus is not a part, and NOTHING may be dealt from it.
  //
  // It is a block like any other to the cursor, and on an empty song sheet it
  // is the only one - so it is exactly where the cursor starts. Every master
  // control is virtual on it, which means the first turn of any master knob
  // appends the call to the end of the block, and the end of that block is the
  // end of `all(x => ...)`:
  //
  //     all(x => x.roomsize(2).orbit(1)).adsr(0.05, 0.1, 0.6, 0.2)
  //
  // That evaluates without complaint and applies to EVERY pattern in the song,
  // and a later `.adsr()` wins over an earlier one - measured: a block calling
  // `.adsr(0.9, ...)` reports an attack of 0.9 alone and 0.05 once the bus
  // carries one. So a master knob touched on the bus silently overwrites the
  // envelope of every part in the song, with no error and nothing on screen
  // saying which block it came from.
  //
  // `orbit(1)` is a live numeric argument on that line too, so the positional
  // dealer hands the song's orbit to a part knob for the same reason.
  //
  // The roomsize knob still works here, and is the only thing that should: it
  // is `shared`, and reads and writes the bus statement through `busSizeSpan`
  // rather than through this block. Pattern build already refuses the bus for
  // the same reason (`canStepInto`); this is the knobs catching up.
  const onBus = hasBus(block.text);
  const args = onBus ? [] : findNumericArgs(block.text, block.from);

  // Reserved tracks first, so they can CLAIM the arguments they bind to and
  // the positional dealer never gives one number a second address.
  const master = onBus
    ? { slots: [], claimed: new Set() }
    : bindFixedControls(args, MASTER_CONTROLS, MASTER_TRACK);
  const reverb = bindFixedControls(
    args.filter((arg) => !master.claimed.has(arg)),
    REVERB_CONTROLS,
    REVERB_TRACK,
  );
  // The bus owns the one roomsize there is, so its slot reads from there
  // rather than from the block - the block has no size and must not grow one.
  const size = busSizeSpan(pane.getCode(id));
  const reverbSlots = reverb.slots
    // On the bus, `room` would be written into `all(...)` as well - a send on
    // the master, which is the one thing a send must never be.
    .filter((slot) => !onBus || slot.shared)
    .map((slot) => (slot.shared && size ? { ...slot, value: Number(size.text), virtual: false } : slot));

  const rest = args.filter((arg) => !master.claimed.has(arg) && !reverb.claimed.has(arg));
  const partSlots = assignArgSlots(rest, PART_TRACKS);
  const slots = [...partSlots, ...master.slots, ...reverbSlots];

  const signature = [
    block.index,
    ...slots.map((slot) => `${slot.track}/${slot.knob}:${slot.fn}@${slot.position ?? 0}`),
  ].join(',');
  if (signature === argSignature) argKnobs.adopt(slots);
  else {
    argSignature = signature;
    argKnobs.prime(slots);
  }

  // Only the slots that actually sit in this block get an annotation row; a
  // virtual control has no column to point at, and the shared size lives in
  // the bus statement further down.
  const inBlock = [...partSlots, ...master.slots, ...reverbSlots].filter((slot) => !slot.virtual);
  const ranges = [
    {
      from: block.start,
      to: block.end,
      rows: argRows(
        inBlock.filter((slot) => slot.line !== null),
        block.end - block.start + 1,
      ),
    },
  ];
  pane.setArgMap(id, ranges);
  pane.setCursorBlock(id, block.index);

  // TC 6 holds an INDEX into this block's functions, so moving to a different
  // block invalidates it - the fourth function of another part is a different
  // word. Reset rather than carry it over, which would outline something the
  // knob was never turned to.
  if (browsedBlock !== `${id}:${block.index}`) {
    browsedBlock = `${id}:${block.index}`;
    browsedFn = null;
    pane.setBrowsedFn(id, null);
  }
}

// ---- building a block from the library ------------------------------------
//
// SEND B latches build mode. While it is on, TAP TEMPO takes whatever the
// browse cursor is on in the right-hand panel and adds it to ONE block: the
// first pick creates it, and every pick after that folds into the same block
// rather than starting another. That is the whole difference from the
// library's ordinary insert - picking a kick and then a snare here means one
// part that alternates between them, not two parts playing at once.
//
// The block stays selected the entire time, so the device knobs are bound to
// its numbers as it is being built rather than after.
let building = null; // { tabId, blockIndex } while SEND B is on
// PAN decides what happens when SEND B goes off: latched, the finished block
// is evaluated and lands on the next cycle boundary; unlatched it stays in the
// document, silent, like everything else this app writes.
let panLatched = false;
// SEND A: the block under construction goes to the cue outputs instead of the
// mains, so it can be heard while the set plays on without the room hearing it.
let monitorOn = false;
let monitorChannels = DEFAULT_MONITOR_CHANNELS;

/**
 * The envelope every built block carries.
 *
 * Appended on creation rather than offered as a pick, because a block with no
 * envelope has nothing to shape and the four numbers here are the four the
 * hand reaches for first - which is also why they are worth having already
 * under the knobs the moment the block exists.
 */
const BUILT_ADSR = '.adsr(0.01, 0.1, 0.6, 0.2)';

/** The block a pattern is stepped into when there is nowhere else to put it. */
const PATTERN_SEED = '$: n("~")';

/** Put the block being built under the knobs and on screen. */
function selectBuilt() {
  if (!building || building.blockIndex === null) return;
  pane.selectBlocks(building.tabId, [building.blockIndex]);
}

/**
 * Add whatever the browse cursor is on to the block under construction.
 *
 * Setup statements are the exception that has to be handled first: `setcpm`
 * and `samples` configure the whole song, and appended into a block halfway
 * down they still run - and then silently change the tempo of everything above
 * them. They are slotted to the top instead.
 */
function addPickToBlock() {
  const pick = panel.getHighlighted();
  if (!pick) {
    status.info('build: nothing under the browse cursor');
    return;
  }
  const id = building.tabId;

  if (classifyItem(pick.code) === 'setup') {
    const lines = pane.getCode(id).split('\n');
    pane.insertLine(id, setupLine(lines), pick.code.trim());
    status.info(`build: ${pick.name} to the top`);
    return;
  }

  if (building.blockIndex === null) {
    building.blockIndex = pane.appendBlock(id, `${pick.code.trim()}${BUILT_ADSR}`);
    focusNewBlock(id, building.blockIndex);
    selectBuilt();
    status.info(`build: ${pick.name}`);
    return;
  }

  const block = pane.getSoleSelectedBlock(id);
  const current = block?.text ?? '';
  const { text, separate, refused } = addToBlock(current, pick.code);
  if (refused) {
    // A `.method()` pick with no code to hang it on. Saying so beats appending
    // it into a comment, where it would vanish without a sound or an error.
    status.info(`build: nothing for ${pick.name} to chain onto`);
    return;
  }
  if (separate) {
    // Not a rejection - a melody and a drum part are two parts however they
    // were picked, and the new one becomes the block now being built.
    building.blockIndex = pane.appendBlock(id, `${text}${BUILT_ADSR}`);
    focusNewBlock(id, building.blockIndex);
  } else {
    pane.replaceBlockText(id, building.blockIndex, text);
  }
  selectBuilt();
  status.info(separate ? `build: ${pick.name} (new block)` : `build: + ${pick.name}`);
}

/**
 * Drop build mode without finishing it.
 *
 * Not `setBuilding(false)`: that is the DELIBERATE end of a build and may
 * evaluate the result, which is wrong for a song that is no longer on screen
 * or no longer exists. This is the same distinction pattern build draws
 * between REC and a tab going away.
 */
function abandonBuilding(reason) {
  if (!building) return;
  building = null;
  status.info(`build: off - ${reason}`);
}

/** Enter or leave build mode. */
function setBuilding(on) {
  if (on) {
    const id = pane.getViewedId();
    if (!id) return;
    building = { tabId: id, blockIndex: null };
    status.info('build: SEND B on - TAP TEMPO adds the browsed item');
    return;
  }
  const finished = building;
  building = null;
  if (!finished || finished.blockIndex === null) {
    status.info('build: off');
    return;
  }
  if (panLatched) {
    // Strudel starts a re-evaluated pattern on the next cycle boundary, which
    // is exactly what PAN is asking for - no countdown of our own is needed.
    live.evaluateActive();
    status.info('build: done, playing from the next cycle');
  } else {
    status.info('build: done, not playing');
  }
}

/**
 * Send the block under construction to the cue outputs, or stop.
 *
 * The suffix goes on the RENDERED source, not into the document: the cue is a
 * way of listening, not an edit, and a block that had been monitored would
 * otherwise keep `.channels("3 4")` after the headphones came off.
 */
function setMonitor(on) {
  monitorOn = on;
  const ctx = audioContext();
  status.info(on ? `monitor: ${splitStatus(ctx, monitorChannels)}` : 'monitor off');
  live.refresh();
}

live.setMonitor(() => {
  if (!monitorOn || !building || building.blockIndex === null) return null;
  return { tabId: building.tabId, blockIndex: building.blockIndex, wrap: (text) => toMonitor(text, monitorChannels) };
});

/**
 * Which function of the cursor block TC 6 is on, by index, or null.
 *
 * Kept as an index rather than a span because the block is being edited
 * underneath it - a knob write changes offsets on every message - and the
 * fourth function is still the fourth function afterwards.
 */
let browsedFn = null;
/** Which block that index belongs to, so it is dropped when the block changes. */
let browsedBlock = null;

/** The functions of the block the knobs are on, in source order. */
function cursorBlockFunctions() {
  const id = pane.getViewedId();
  const index = id ? cursorBlockIndex() : null;
  const block = index === null ? null : pane.getBlockAt(id, index);
  return block ? blockFunctions(block.text, block.from) : [];
}

/**
 * Move TC 6 through the block's functions.
 *
 * Selecting a function also tabs the library to the list that can answer it -
 * a sample call wants a sound, an effect wants another effect - so the pick
 * and the thing being replaced cannot get out of step. That is the whole
 * reason the tab switch lives here and not under the user's thumb.
 */
function moveBrowsedFn(steps) {
  const fns = cursorBlockFunctions();
  const next = stepFunction(browsedFn ?? -1, steps, fns.length);
  if (next === null) {
    status.info('no functions in this block');
    return;
  }
  browsedFn = next;
  const fn = fns[next];
  panel.showTab(fn.tab);
  pane.setBrowsedFn(pane.getViewedId(), { from: fn.from, to: fn.to });
  status.info(`${fn.name}(${fn.arg}) - ${fn.replaces} from ${fn.tab}`);
}

/**
 * Replace the browsed function, or its argument, with the library pick.
 *
 * Which of the two is not a mode: an effect swaps its NAME and keeps its
 * number, because 400 is a cutoff whichever filter reads it; a sample call
 * swaps its ARGUMENT and keeps the call, because `s(...)` is still what plays
 * it. Both are the same gesture, and the function decides.
 */
function replaceBrowsedFn() {
  const id = pane.getViewedId();
  const fns = cursorBlockFunctions();
  const fn = browsedFn === null ? null : fns[browsedFn];
  const pick = panel.getHighlighted();
  const edit = replacementFor(fn, pick);
  if (!edit) {
    status.info(
      fn && pick ? `${pick.name} cannot replace ${fn.name}` : 'nothing browsed to replace',
    );
    return;
  }
  pane.replaceRange(id, edit.from, edit.to, edit.text);
  status.info(`${fn.name}: ${edit.text}`);
  // Offsets moved, so re-point the outline at the same function by index.
  const moved = cursorBlockFunctions()[browsedFn];
  pane.setBrowsedFn(id, moved ? { from: moved.from, to: moved.to } : null);
}

// ---- pattern build mode ---------------------------------------------------
//
// The clip grid becomes a piano roll: eight columns of eighth-notes along the
// bottom, the row above each splitting one into sixteenths, and the top two
// rows the scale with row 2 as the black keys. See pattern-build.js for the
// model and for why each mini-notation form is the one it is.
//
// Entered by touching any bottom-row pad while a block is under the cursor,
// and left with REC. Both of those addresses already mean something else -
// row 1 solos a song tab, REC pins a block - so the mode does not add
// controls, it re-scopes them, and every one of those handlers checks it.
let patternMode = null; // { pattern, blockIndex, tabId }
// Which pads are down right now. A note is written by a COMBINATION - a step
// held while a degree is pressed - so both halves have to be tracked across
// their own press and release rather than acted on individually.
const heldLower = new Set(); // row 5: the eighth-note columns
const heldUpper = new Set(); // row 4: the sixteenth after that eighth
const heldSharp = new Set(); // row 2: raise the degree above it a semitone
// The column a degree press writes into: the most recent bottom-row pad still
// down, so a chord of held steps still has one unambiguous target.
let activeColumn = null;

/** `apc40.track3.clip5` -> `{ column: 2, row: 5 }`, or null. */
function clipPad(name) {
  const match = /^apc40\.track([1-8])\.clip([1-5])$/.exec(name ?? '');
  return match ? { column: Number(match[1]) - 1, row: Number(match[2]) } : null;
}

/** Light row 2 where a semitone above the degree is outside the scale. */
function paintPatternLeds(on) {
  const lit = on ? new Set(accidentalDegrees(patternMode?.pattern.mode)) : new Set();
  for (let column = 0; column < COLUMNS; column += 1) {
    // Note 54 is clip2 - the black-key row. Channel is the track, which on
    // this surface is the column. See apc40-map.json.
    sendNote(device.outPort, column, 54, lit.has(column) ? LED.yellow : LED.off);
  }
}

/** The step a degree press lands on, or null when no step is held. */
function heldStep() {
  if (activeColumn === null || !heldLower.has(activeColumn)) return null;
  return stepIndex(activeColumn, heldUpper.has(activeColumn));
}

/** Write the pattern over the block being edited. */
function writePattern() {
  const { tabId, pattern, blockIndex } = patternMode;
  // The write is the last thing that could notice the target is gone, and
  // editor.js returns quietly on a missing tab - so an unchecked write here
  // means every pad press does nothing, with the grid still lit as though it
  // were recording. Say so and drop out instead.
  if (!pane.hasTab(tabId)) {
    exitPatternMode();
    status.info('pattern build: off - the song it was writing into is gone');
    return;
  }
  pane.replaceBlockText(tabId, blockIndex, patternBlock(pattern));
  pane.selectBlocks(tabId, [blockIndex]);
}

/**
 * Start stepping into the highlighted block, in place.
 *
 * A block this mode already wrote is READ BACK first, so re-entering to add a
 * note continues the pattern instead of replacing it with an empty bar -
 * without that, "edit in place" would quietly mean "in place of". A block that
 * is not one of ours cannot be round-tripped and is started fresh; the mode
 * says so rather than appearing to have parsed something it did not.
 */
function enterPatternMode() {
  const id = pane.getViewedId();
  const index = cursorBlockIndex();
  if (!id || index === null) return;
  let target = index;
  let text = pane.getBlockAt(id, target)?.text ?? '';

  // Two things must never be stepped over, and both would be destroyed
  // silently because this mode edits in place:
  //
  //   the reverb bus - not a part, and on an empty sheet it is the ONLY block
  //   so it is also what the cursor lands on;
  //
  //   a melody this grid cannot write back - `n("e4 g4 c5")` read as sixteen
  //   rests, or a twenty-step bar read as its first sixteen. The block gets
  //   rewritten on the FIRST pad press, so a hand-written line would be gone
  //   before anyone saw it happen.
  //
  // Either way the pattern goes into a new block of its own instead.
  if (hasBus(text) || !canStepInto(text)) {
    target = pane.appendBlock(id, PATTERN_SEED);
    focusNewBlock(id, target);
    text = '';
  }

  // A block this mode wrote is read back whole. Anything else - most usefully
  // the `s("piano")` that SEND B just put there - keeps its voice and its
  // chain, and the pattern becomes the n() in front of them. Stepping a melody
  // must not throw away the sound it is meant to be played by.
  const existing = parsePattern(text);
  const pattern = existing ?? createPattern(songKey(pane.getCode(id)) ?? undefined);
  if (!existing) pattern.suffix = blockSuffix(text);

  patternMode = { pattern, blockIndex: target, tabId: id };
  paintPatternLeds(true);
  // A half-finished SCENE 3 gesture belongs to the session it was made in.
  // Carried over, the first press of the next session counts as the second
  // tap of the last one and blanks a segment instead of duplicating it.
  segmentGate.reset();
  // The key is stated on entry rather than assumed. "Pre-determined" has to
  // mean determined by something, and every degree stepped from here means
  // nothing without it.
  const voice = pattern.suffix ? ` over ${pattern.suffix.slice(0, 24)}` : '';
  status.info(`pattern build: ${describeKey(pattern)}${voice}. REC to exit.`);
}

function exitPatternMode() {
  paintPatternLeds(false);
  patternMode = null;
  heldLower.clear();
  heldUpper.clear();
  heldSharp.clear();
  activeColumn = null;
  status.info('pattern build: off');
}

/**
 * Every pad and scene press while the mode is on. Returns true when the
 * control was consumed, so the handlers it re-scopes never also run.
 */
function patternControl(control) {
  const pad = clipPad(control.name);
  const down = control.isDown === true;

  if (pad) {
    const { column, row } = pad;
    if (row === 5) {
      // Both edges: the step is a modifier, and dropping its release would
      // leave every later degree press writing into a step nobody is holding.
      if (down) {
        // Delete before adding so a re-press moves the column to the END of
        // the set - insertion order is what "most recent" means here.
        heldLower.delete(column);
        heldLower.add(column);
        activeColumn = column;
      } else {
        heldLower.delete(column);
        // Fall back to whatever is STILL held rather than to nothing. Letting
        // go of the newer of two held steps used to leave no target at all,
        // so a degree pressed afterwards went nowhere while a pad was still
        // visibly down.
        if (activeColumn === column) activeColumn = [...heldLower].at(-1) ?? null;
      }
      return true;
    }
    if (row === 4) {
      if (down) heldUpper.add(column); else heldUpper.delete(column);
      return true;
    }
    if (row === 2) {
      if (down) heldSharp.add(column); else heldSharp.delete(column);
      return true;
    }
    if (!down) return true; // rows 1 and 3 act on press only
    if (row === 1) {
      const step = heldStep();
      if (step === null) {
        status.info('hold a step before pressing a degree');
        return true;
      }
      setStep(patternMode.pattern, step, { degree: column, sharp: heldSharp.has(column) });
      writePattern();
      return true;
    }
    if (row === 3) {
      setRepeats(patternMode.pattern, column + 1);
      writePattern();
      status.info(`repeats: ${column + 1}`);
      return true;
    }
  }

  if (control.isDown !== true) return false;

  if (control.name === 'apc40.scene1') {
    const step = heldStep();
    if (step === null) {
      status.info('hold a step to rest it');
      return true;
    }
    setRest(patternMode.pattern, step);
    writePattern();
    return true;
  }
  if (control.name === 'apc40.scene3') {
    // A double press cannot be known until the second press lands, and by then
    // the first has already duplicated the segment. So the second CONVERTS
    // that duplicate to empty rather than adding a second one - one gesture,
    // one segment, either way.
    if (segmentGate.tap(performance.now())) {
      makeActiveEmpty(patternMode.pattern);
      status.info('empty segment, same length');
    } else {
      addSegment(patternMode.pattern);
      status.info('segment duplicated');
    }
    writePattern();
    return true;
  }
  if (control.name === 'apc40.global.rec') {
    exitPatternMode();
    return true;
  }
  return false;
}

/** Two taps of SCENE 3 inside the window means "empty" rather than "copy". */
const segmentGate = createTapGate({ taps: 2, windowMs: 400 });

// The caret moving changes WHICH block is addressed; an edit changes what its
// numbers are. Both land here, and both are what keeps the knobs and the
// annotation pointing at the code actually on screen.
pane.onCursorMove(() => {
  explainer.refresh();
  refreshArgMap();
});

// Changing song drops the selection: the indexes named blocks in the old song,
// and the same numbers in a different arrangement are different music.
pane.onViewTab(() => {
  blockCursor.clear();
  // Pattern build addresses a block by index in ONE tab. Carrying it to
  // another song would keep every grid press rewriting a block that is no
  // longer on screen - invisible, with the pads still lit as though they were
  // editing what you are looking at.
  if (patternMode) exitPatternMode();
  // Build mode holds a tab id for exactly the same reason and with exactly the
  // same consequence: TAP TEMPO would keep appending picks to the song you
  // just left, invisibly, while the monitor cue pointed at a block on screen
  // nowhere. `live.setMonitor` reads `building.tabId` too.
  abandonBuilding('a different song is on screen');
  refreshArgMap();
});

// A tab can also go away WITHOUT the view changing - the crossfader-timed
// delete closes the song it was aimed at, which may no longer be the one on
// screen by the time the count lands. onViewTab covers the viewed tab only.
pane.onCloseTab((id) => {
  if (patternMode?.tabId === id) {
    exitPatternMode();
    status.info('pattern build: off - that song was deleted');
  }
  // Build mode fails LOUDER than pattern build did, and that is what makes it
  // worse rather than better: `pane.getCode` is the one accessor that reads
  // `tabs.get(id).view` without a guard, so a setup pick after the song was
  // deleted throws a TypeError out of the MIDI handler instead of quietly
  // doing nothing.
  if (building?.tabId === id) abandonBuilding('that song was deleted');
});

// SEND C: audition the highlighted sound once a beat, so a bank can be
// browsed by ear. Free-running rather than locked to the transport - hunting
// for a sample is mostly done while the set is stopped, and a clock that only
// ticked during playback would be silent exactly then.
const audition = createAudition({
  play: (name) => previewSound(name),
  getSound: () => panel.getHighlightedSound(),
  getCps: () => getTransport()?.cps ?? 0.5,
  now: () => performance.now() / 1000,
});
// One timer for the life of the page. It is a no-op while the audition is off,
// which costs less than starting and stopping an interval on every press.
setInterval(() => {
  audition.tick();
  stepTempoRamp();
}, 20);

// The two knobs made relative in software. Track control knobs rather than
// device knobs because the device bank re-addresses itself to whichever track
// is selected, and a browse control that changed meaning with the selection
// would be unusable.
const relative = createRelativeBank({
  knobs: [
    'apc40.trackctl.knob1',
    'apc40.trackctl.knob3',
    'apc40.trackctl.knob4',
    'apc40.trackctl.knob6',
    'apc40.trackctl.knob7',
    'apc40.trackctl.knob8',
  ],
  send: (name, value) => {
    const control = {
      'apc40.trackctl.knob1': 48,
      'apc40.trackctl.knob3': 50,
      'apc40.trackctl.knob4': 51,
      'apc40.trackctl.knob6': 53,
      'apc40.trackctl.knob7': 54,
      'apc40.trackctl.knob8': 55,
    }[name];
    if (control) sendCC(device.outPort, 0, control, value);
  },
});

// One list position per MIDI message is faster than anyone can read - these
// encoders send up to 200 a second. Each scroll control moves one step per N
// messages instead, with the remainder carried rather than dropped so a slow
// turn still arrives.
//
// Kept as two names rather than one constant because they are not the same
// control: the knobs are absolute pots made relative in software (see
// relative.js), so every physical step of the pot is a message, while the cue
// encoder's firmware puts turn speed in the magnitude - which this layer
// discards by taking only the sign. They happen to want the same divisor now;
// they have already wanted different ones once.
const KNOB_DIVISOR = 4;
const CUE_DIVISOR = 4;

// UP deletes the song on screen, and does it three taps in. The APC40's
// buttons are large and close together, so a one-press delete would be one
// fumble away for the whole set.
const deleteGate = createTapGate({ taps: 3, windowMs: 600 });

const steppers = {
  'apc40.trackctl.knob1': createStepper(KNOB_DIVISOR),
  'apc40.trackctl.knob3': createStepper(KNOB_DIVISOR),
  'apc40.trackctl.knob4': createStepper(KNOB_DIVISOR),
  'apc40.trackctl.knob6': createStepper(KNOB_DIVISOR),
  'apc40.trackctl.knob7': createStepper(KNOB_DIVISOR),
  'apc40.trackctl.knob8': createStepper(KNOB_DIVISOR),
  'apc40.global.cue_level': createStepper(CUE_DIVISOR),
};

/**
 * Navigation the control surface performs directly, rather than through the
 * action map: these carry a DELTA, and an action is a name with no argument.
 * Returns true when the control was consumed.
 */
function navigate(control) {
  const turn = relative.feed(control);
  if (turn) {
    if (turn.delta === 0) return true;
    const steps = steppers[turn.name].feed(Math.sign(turn.delta));
    if (steps === 0) return true;
    // knob2 under SHIFT is how long a tempo change takes. It edits nothing on
    // its own - it is the shape of the NEXT turn of knob 3.
    if (turn.name === 'apc40.trackctl.knob2') {
      if (!shiftHeld) return true;
      rampCycles = clampRamp(rampCycles + steps);
      status.info(
        rampCycles === 0
          ? 'tempo change: immediate'
          : `tempo change over ${rampCycles} cycle${rampCycles === 1 ? '' : 's'}`,
      );
      return true;
    }
    // knob3 under SHIFT is the tempo, and like the key it is song-global -
    // there is one setcpm, and a second would be a tempo change nobody asked
    // the knob for.
    if (turn.name === 'apc40.trackctl.knob3') {
      if (!shiftHeld) return true;
      const id = pane.getViewedId();
      if (!id) return true;
      const code = pane.getCode(id);
      // A ramp already running is the truth about where the tempo is; the
      // written song still says where it started.
      const current = tempoRamp ? tempoRamp.current : songBpm(code);
      if (current === null) {
        status.info('no tempo declared in this song');
        return true;
      }
      const bpm = clampBpm(current + steps);
      if (bpm === Math.round(current)) {
        status.info(`bpm: ${bpm} (${BPM_RANGE.min}-${BPM_RANGE.max})`);
        return true;
      }
      startTempoRamp(id, current, bpm);
      return true;
    }
    // knob4 under SHIFT walks the song's key round the circle of fifths. It
    // is song-global on purpose: two blocks in different keys is not a
    // modulation, it is a mistake nobody typed deliberately.
    if (turn.name === 'apc40.trackctl.knob4') {
      if (!shiftHeld) return true;
      const id = pane.getViewedId();
      if (!id) return true;
      const code = pane.getCode(id);
      const current = songKey(code);
      if (!current) {
        status.info('no key declared in this song');
        return true;
      }
      const key = nextKey(current.key, steps);
      pane.setCode(id, setSongKey(code, key));
      if (patternMode) patternMode.pattern.key = key;
      live.refresh();
      status.info(`key: ${key.toUpperCase()} ${current.mode}`);
      return true;
    }
    // knob1 sweeps the octave of the pattern being stepped in - and only
    // while that is happening, because outside the mode there is no pattern
    // for it to be the octave OF.
    if (turn.name === 'apc40.trackctl.knob1') {
      if (!patternMode) return true;
      const next = patternMode.pattern.octave + steps;
      setOctave(patternMode.pattern, next);
      writePattern();
      status.info(`pattern build: ${describeKey(patternMode.pattern)}`);
      return true;
    }
    // knob6 walks the functions of the block under the block cursor; knob7
    // walks the library's category headings, knob8 the rows inside one.
    if (turn.name === 'apc40.trackctl.knob6') {
      moveBrowsedFn(steps);
      return true;
    }
    const label =
      turn.name === 'apc40.trackctl.knob7'
        ? panel.moveCategory(steps)
        : panel.moveItem(steps);
    if (label) status.info(label);
    return true;
  }

  if (control.name === 'apc40.global.cue_level') {
    // Already relative in firmware - device-map decodes it as a signed delta.
    const id = pane.getViewedId();
    if (!id) return true;
    const steps = steppers['apc40.global.cue_level'].feed(Math.sign(control.value));
    if (steps === 0) return true;
    blockCursor.move(steps, pane.getBlockCount(id));
    showBlockSelection();
    return true;
  }

  // The device knobs, when a single block is selected. Checked before the
  // generic paths so a stray `cc:16` binding cannot also fire on a knob that
  // is currently driving a number in the source.
  if (deviceKnobIndex(control.name) !== null && argKnobs.feed(control)) return true;

  // Pattern build mode owns the grid, the scenes and REC while it is on. It
  // is checked before all of them because it does not ADD controls, it
  // re-scopes ones that already mean something else.
  if (patternMode && patternControl(control)) return true;

  // Touching a bottom-row pad with a block under the cursor is what starts it.
  // Only on press, and only with somewhere to write: entering a build mode
  // that has no destination would strand every pad that followed.
  if (!patternMode && control.isDown === true && clipPad(control.name)?.row === 5) {
    if (cursorBlockIndex() === null) {
      status.info('select a block before stepping a pattern');
      return true;
    }
    enterPatternMode();
    // The pad that opened the mode is also the first step held down, so hand
    // it straight on rather than making the performer press it twice.
    patternControl(control);
    return true;
  }

  // The top row of clip pads, one per song tab on the top strip. Hold one or
  // more and only those songs play; let go and the set returns to exactly what
  // it was. That is the existing momentary SOLO, addressed by pad instead of
  // by key - so the "return to previous state" is not a snapshot anyone has to
  // take, it is what solo already means: while nothing is held, the held set
  // is empty and the render is the ordinary one.
  //
  // Read BEFORE the press-only guard, like the other momentary controls: a
  // hold is defined by its release as much as its press, and dropping the
  // note-off would leave the set soloed for good.
  const clip = /^apc40\.track([1-8])\.clip1$/.exec(control.name);
  if (clip) {
    const songTabs = pane.getTabs().filter((tab) => tab.bar === 'top');
    const tab = songTabs[Number(clip[1]) - 1];
    // A pad with no song under it does nothing, rather than soloing whichever
    // tab happens to be last - eight pads are always there, songs are not.
    if (tab && live.setTabHeld(tab.id, 'solo', control.isDown === true)) {
      live.evaluateActive();
      const held = songTabs.filter((t) => live.isTabHeld(t.id)).map((t) => t.name);
      status.info(held.length ? `solo: ${held.join(' + ')}` : 'solo released');
    }
    return true;
  }

  // SHIFT is a modifier now rather than an action - it selects what the next
  // knob turn MEANS - so like DETAIL VIEW it is read on both edges. A modifier
  // that missed its release would leave every later turn re-keying the song.
  if (control.name === 'apc40.global.shift') {
    shiftHeld = control.isDown === true;
    return true;
  }

  // Read BEFORE the press-only guard below: a modifier is defined by its
  // release as much as its press, and dropping the note-off would leave the
  // whole song armed for good.
  if (control.name === 'apc40.device.detail_view') {
    wholePageHeld = control.isDown === true;
    return true;
  }

  // ---- buttons that LATCH on the device ------------------------------------
  //
  // Confirmed on the hardware with the MIDI monitor: the APC40 keeps the state
  // of these itself. One press sends velocity 1, the NEXT press sends 0, and
  // there is no release message in between. `apc40-map.json` has said
  // `"behavior": "toggle"` about all thirty-two of them since the map was
  // written; nothing read it until now.
  //
  // Treating them as momentary is what produced "SEND C will not turn off":
  //
  //   press 1  velocity 1  ->  isDown true   flip   ON,  device lit
  //   press 2  velocity 0  ->  isDown false  DROPPED by the press-only guard
  //   press 3  velocity 1  ->  isDown true   flip   OFF, device lit
  //   press 4  velocity 0  ->  DROPPED
  //
  // Four presses for one on-and-off, and for half of that cycle the LED said
  // the opposite of what the app was doing. The fix is not a better flip: it is
  // to stop keeping a second copy of the state at all. The device knows, and
  // `isDown` is what it is telling us, so ADOPT it.
  //
  // Only these four are bound today. The other twenty-eight - the clip/track
  // and device arrows, and the activator, solo/cue and record-arm rows - latch
  // identically, so anything binding one must set from `isDown` rather than
  // flip, and must be handled here, ABOVE the press-only guard.
  const LATCHING = {
    'apc40.trackctl.pan': (on) => {
      panLatched = on;
      status.info(on ? 'finished blocks play next cycle' : 'finished blocks stay silent');
    },
    'apc40.trackctl.send_a': (on) => setMonitor(on),
    'apc40.trackctl.send_b': (on) => setBuilding(on),
    'apc40.trackctl.send_c': (on) => {
      audition.setOn(on);
      status.info(
        on
          ? `audition on: ${panel.getHighlightedSound() ?? 'no sound highlighted'}`
          : 'audition off',
      );
    },
  };
  if (control.behavior === 'toggle' && LATCHING[control.name]) {
    LATCHING[control.name](control.isDown === true);
    return true;
  }

  if (control.isDown !== true) return false; // buttons act on press only

  switch (control.name) {
    case 'apc40.global.nudge_minus':
      status.info(`library: ${panel.moveTab(-1)}`);
      return true;
    case 'apc40.global.nudge_plus':
      status.info(`library: ${panel.moveTab(1)}`);
      return true;
    case 'apc40.global.up': {
      // Three taps, not one: this deletes a song. The gate reports how far in
      // the gesture is, so a single stray press says what it did and no more.
      if (!deleteGate.tap(performance.now())) {
        status.info(`delete song: tap ${deleteGate.pending()}/3`);
        return true;
      }
      actions.deleteTab();
      return true;
    }
    case 'apc40.global.rec': {
      const pinned = blockCursor.latch();
      showBlockSelection();
      status.info(pinned ? `block ${blockCursor.cursor + 1} kept` : `block ${blockCursor.cursor + 1} let go`);
      return true;
    }
    case 'apc40.global.tap_tempo':
      // A browsed function wins over build mode: TC 6 was turned more
      // recently than SEND B was latched, so it is the more specific
      // statement of what this press is for.
      if (browsedFn !== null) {
        replaceBrowsedFn();
        return true;
      }
      if (!building) return false; // outside build mode it is not ours
      addPickToBlock();
      return true;
    case 'apc40.global.stop_all':
      blockCursor.clear();
      showBlockSelection();
      status.info('selection cleared');
      return true;
    default:
      return false;
  }
}

// Last crossfader position, 0..1, or null until it has been moved. A fader has
// a physical position the app cannot read - nothing arrives until it is
// touched - so "never moved" has to be a distinct state from "at zero", even
// though both arm an immediate change.
let crossfader = null;

// DETAIL VIEW held: play/stop act on the whole song page rather than on the
// selection. It is note 62, the one MOMENTARY button in the device section -
// the four above it (58-61) latch and send no note-off, so "held" could not
// have been read from them at all.
let wholePageHeld = false;

// SHIFT held: the next knob turn changes what the whole SONG is in, rather
// than one number in one block.
let shiftHeld = false;

// How many cycles a tempo change is spread over. Zero is a hard cut, which is
// the right default - most tempo changes in a set are cuts, and a blend is the
// thing you reach for deliberately.
let rampCycles = 0;
// The tempo change in flight: { tabId, from, to, startCycle, cycles, current }.
let tempoRamp = null;

/**
 * Blend the transport from one tempo to another.
 *
 * The scheduler's cps is retimed directly, once per frame, and the DOCUMENT IS
 * WRITTEN ONCE when the ramp lands. Rewriting `setcpm` to move the tempo would
 * queue a full re-render of the set per step - the same backlog that made the
 * surface go deaf under a knob sweep - so the source stays still while the
 * clock moves, and catches up at the end.
 *
 * Progress is measured in CYCLES off the transport rather than in wall-clock
 * time, because the thing being changed is what turns cycles into seconds: a
 * timer would drift against the music it is blending.
 */
function startTempoRamp(tabId, from, to) {
  const immediate = rampCycles === 0 || !live.isRunning();
  if (immediate) {
    pane.setCode(tabId, setSongBpm(pane.getCode(tabId), to));
    live.refresh();
    tempoRamp = null;
    status.info(`bpm: ${to}`);
    return;
  }
  tempoRamp = {
    tabId,
    from,
    to,
    cycles: rampCycles,
    startCycle: getTransport()?.cycle ?? 0,
    current: from,
  };
  status.info(`bpm: ${Math.round(from)} -> ${to} over ${rampCycles} cycles`);
}

/** One frame of the ramp. A no-op when nothing is blending. */
function stepTempoRamp() {
  if (!tempoRamp) return;
  const now = getTransport()?.cycle;
  if (now === undefined) return;
  const t = rampProgress(tempoRamp.startCycle, now, tempoRamp.cycles);
  tempoRamp.current = rampBpm(tempoRamp.from, tempoRamp.to, t);
  setTransportCps(bpmToCps(tempoRamp.current));
  if (t < 1) return;
  // Landed. Now - and only now - the source is told, so the song on screen
  // agrees with the clock and survives a re-evaluation.
  const { tabId, to } = tempoRamp;
  tempoRamp = null;
  pane.setCode(tabId, setSongBpm(pane.getCode(tabId), to));
  live.refresh();
  status.info(`bpm: ${to}`);
}

const actions = createActions({
  pane,
  panel,
  status,
  live,
  explainer,
  getCrossfader: () => crossfader,
  getSelectAll: () => wholePageHeld,
});

function dispatch(trigger) {
  const name = resolveAction(triggerMap, trigger);
  if (name) actions[name]();
  return Boolean(name);
}

/**
 * The momentary layer: block-unmute and per-tab add/solo. Unlike an action,
 * these need both edges - what they do IS the holding - so they are matched on
 * press and release rather than through the action map.
 *
 * Returns true if the trigger was a hold binding, so the caller knows not to
 * also run it as a one-shot action.
 */
function applyHold(trigger, isDown) {
  const blockIndex = resolveHold(holdSlots, trigger);
  const tabHold = resolveTabHold(currentTabHolds(), trigger);
  if (blockIndex === null && !tabHold) return false;

  let changed = false;
  if (blockIndex !== null) changed = live.setBlockHeld(blockIndex, isDown) || changed;
  if (tabHold) changed = live.setTabHeld(tabHold.tabId, tabHold.mode, isDown) || changed;
  // A keydown autorepeats while held, and a controller can resend the same
  // state; only a real edge is worth re-parsing the whole set for.
  if (changed) live.evaluateActive();
  return true;
}

function handleKeyHold(event, isDown) {
  const trigger = keyEventToTrigger(event);
  if (resolveHold(holdSlots, trigger) === null && !resolveTabHold(currentTabHolds(), trigger)) {
    return false;
  }
  // Before anything else: F-keys and Alt+digit are browser UI keys.
  event.preventDefault();
  return applyHold(trigger, isDown);
}

window.addEventListener('keydown', (event) => {
  if (handleKeyHold(event, true)) return;
  if (dispatch(keyEventToTrigger(event))) event.preventDefault();
});

window.addEventListener('keyup', (event) => handleKeyHold(event, false));

// A key released while the window is not focused never delivers its keyup
// here, which would leave a block or a whole tab stuck on after alt-tabbing
// away mid-hold. Treat losing focus as releasing everything.
window.addEventListener('blur', () => {
  if (live.releaseAll()) live.refresh();
});

showBootScreen(
  async () => {
    // FIRST, before any await: raise the explainer alongside the app.
    //
    // window.open is only permitted while the boot click's user activation is
    // still there, and activation is spent by more than the passage of time -
    // a gated API that has to prompt consumes it. enableMidi() is exactly
    // that: on a profile's first run, requestMIDIAccess({ sysex: true }) puts
    // up a permission prompt, and by the time the user answers it the click
    // that opened this app has been used up. Opening from further down the
    // sequence therefore worked on every subsequent launch and failed on the
    // one launch that mattered - the first one, where the app reported
    // "explainer blocked" for something the user did nothing to cause.
    //
    // Nothing here needs audio or MIDI: the explainer is a renderer over
    // editor state, which already exists. Focus stays on the editor - it is
    // something to glance at on a second screen, never the window the next
    // keystroke lands in.
    const explainerStatus = explainer.open({ focusIt: false });
    window.focus();

    await unlockAudio();
    const midiOk = await enableMidi();
    const outputs = listOutputs();
    const preferredOutput = outputs.find((name) => name.includes('loopMIDI')) ?? outputs[0];
    status.setMidi(midiOk ? (preferredOutput ?? 'no outputs') : 'not connected');
    // One MIDI input drives the app itself - tabs, blocks, holds, actions.
    // Every OTHER input is left completely alone, so a keyboard or controller
    // feeding a pattern through midin() is never also flipping tabs. Defaults
    // to the first input, which is the single-controller case; pick "(none)"
    // in settings to give the app no control surface at all.
    const inputs = listInputs();
    // The port the device map was built against, if it is here. Falling
    // straight to inputs[0] is what makes a surface look dead while the MIDI
    // monitor - which listens to every input - clearly shows it sending: the
    // app was simply listening to a different port. An exact name first, then
    // any input that names the device, then the old first-input default.
    controlPort =
      inputs.find((name) => name === device.inPort) ??
      inputs.find((name) => name.toLowerCase().includes('apc40')) ??
      inputs[0] ??
      null;
    // The monitor is deliberately wired ahead of the control-port filter and
    // sees EVERY input. Which port the controller is actually on is one of the
    // things it exists to answer, and a monitor that only listens to the port
    // you already guessed cannot tell you that you guessed wrong.
    // Park the browse knobs at their centre so the first turn measures a real
    // movement rather than the distance from wherever they were left. Silent
    // if the surface is not plugged in - which is the normal case.
    relative.park();

    const monitor = createMidiMonitor(document.getElementById('settings-pane'), {
      describe: device.describe,
    });
    for (const input of inputs) {
      onMidiMessage(input, (data) => {
        monitor.feed(data, input);
        if (input !== controlPort) return;
        try {
          handleControlMessage(data);
        } catch (err) {
          // A throw in here used to end the listener for that message and
          // nothing else - the monitor kept scrolling and the surface did
          // nothing, with no way to tell the two apart. Say so instead.
          console.error('[midi] control message failed', err);
          status.error(`control surface: ${err?.message ?? err}`);
        }
      });
    }

    /**
     * Everything the control surface means, for one message off the wire.
     *
     * Extracted from the listener so a throw has somewhere to be caught: an
     * exception here used to end that one message quietly, leaving a surface
     * that looked plugged in, kept scrolling in the monitor, and did nothing.
     */
    function handleControlMessage(data) {
      // Named control first, raw note:/cc: second. A name is the more
      // specific statement of intent - `apc40.track3.clip1` means one
      // physical button, where `note:55` means that button on any of eight
      // tracks - and resolving it first is what lets the two live together:
      // every existing note:/cc: binding still works, and still catches
      // surfaces this app has no map for.
      const control = device.resolve(data);
      if (control?.name === 'apc40.global.crossfader') {
        crossfader = control.value;
        // Show the figure on the selection as the fader moves, so the
        // countdown is readable before the button is pressed rather than
        // only reported after it.
        pane.setCycleCount(crossfaderCycles(crossfader));
      }
      if (control && captureControl(control)) return;
      // Navigation before bindings: these controls carry a delta and are
      // owned by the browser layer, so a stray note:/cc: binding on the same
      // number must not also fire.
      if (control && navigate(control)) return;

      // Holds first within each vocabulary: a pad bound to a hold must not
      // also fire a one-shot action on the same note-on.
      if (control?.isDown !== null && control && applyHold(control.name, control.isDown)) return;
      const hold = midiDataToHold(data);
      if (hold && applyHold(hold.trigger, hold.isDown)) return;

      if (control?.isDown === true && dispatch(control.name)) return;
      const trigger = midiDataToTrigger(data);
      if (trigger) dispatch(trigger);
    }

    createSettings(document.getElementById('settings-pane'), {
      triggerMap,
      controlNames: device.names(),
      // Hands settings a one-shot subscription to the next control press, so
      // REBIND can capture a pad the same way it captures a key.
      onCaptureControl: (capture) => {
        pendingControlCapture = capture;
        return () => {
          if (pendingControlCapture === capture) pendingControlCapture = null;
        };
      },
      getHoldSlots: () => holdSlots,
      onHoldSlotsChange: (next) => {
        holdSlots = next;
      },
      getTabHolds: currentTabHolds,
      onTabHoldsChange: (next) => {
        tabHoldOverrides = next;
      },
      getBlockLabels: () => pane.getBlockLabels(pane.getActiveId() ?? pane.getViewedId()),
      getControlPort: () => controlPort,
      onControlPortChange: (name) => {
        // Whatever was held on the old surface can no longer send its release.
        if (live.releaseAll()) live.refresh();
        controlPort = name;
        status.info(name ? `control surface: ${name}` : 'control surface: none');
      },
      onPortPick: (name) => {
        pane.insertAtCursor(`.midi('${name}')`);
        status.setMidi(name);
      },
    });
    // Mark the first tab active WITHOUT evaluating it. Booting into silence is
    // deliberate: an instrument that starts playing the moment it is switched
    // on gives the performer no chance to choose the downbeat, and no chance to
    // read what is in the buffer before the room hears it. Nothing reaches the
    // parser until something is deliberately triggered - Ctrl+Enter, a hold
    // key, or a MIDI pad.
    //
    // Active-but-unevaluated is a real state, not a half-initialised one: the
    // tab bar shows which song IS the set, the explainer describes it, and
    // Ctrl+Enter plays exactly what is on screen.
    pane.setActiveTab(first);

    // The explainer was opened at the top of this handler; it has been
    // rendering the empty editor since. Now that the tab is active, tell it.
    explainer.refresh();

    // Name the port the app is LISTENING to, not just the one it writes to.
    // Which input drives the surface is the first thing to check when the
    // monitor is scrolling and nothing responds, and it was the one fact the
    // boot line did not report.
    const surface = controlPort ? `surface: ${controlPort}` : 'no control surface';
    status.info(
      explainerStatus.startsWith('explainer blocked')
        ? `ready — Ctrl+Enter to play (${surface}; ${explainerStatus})`
        : `ready — Ctrl+Enter to play (${surface})`,
    );
  },
  { onError: (err) => status.error(String(err?.message ?? err)) },
);
