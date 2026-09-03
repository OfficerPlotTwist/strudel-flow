import { initEngine, unlockAudio } from './engine.js';
import { enableMidi, listInputs, listOutputs, onMidiMessage } from './midi.js';
import { createEditorPane } from './editor.js';
import { createLive } from './live.js';
import { isStandaloneBlock } from './blocks.js';
import { showBootScreen } from './ui/boot.js';
import { createLibraryPanel } from './ui/panel.js';
import { createStatus } from './ui/status.js';
import { createSettings } from './ui/settings.js';
import { createMidiMonitor } from './ui/midi-monitor.js';
import { createDeviceMap } from './device-map.js';
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
} from './triggers.js';

const status = createStatus(document.getElementById('status-strip'));

const pane = createEditorPane(document.getElementById('editor-pane'));

// Called before the gesture, on purpose. See engine.js. onDraw feeds one
// shared per-frame loop; it only ever reads state, never evaluates.
initEngine({
  onError: (msg) => status.error(msg),
  onDraw: (haps, time) => pane.highlight(haps, time),
});
const first = pane.addTab('song-1', '$: s("bd sd")\n\n$: note("<c a f e>(3,8)")');

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
      pane.insertAsBlock(code);
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
pane.onCursorMove(() => explainer.refresh());

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
const actions = createActions({ pane, panel, status, live, explainer });

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
    controlPort = inputs[0] ?? null;
    // The monitor is deliberately wired ahead of the control-port filter and
    // sees EVERY input. Which port the controller is actually on is one of the
    // things it exists to answer, and a monitor that only listens to the port
    // you already guessed cannot tell you that you guessed wrong.
    const monitor = createMidiMonitor(document.getElementById('settings-pane'), {
      describe: device.describe,
    });
    for (const input of inputs) {
      onMidiMessage(input, (data) => {
        monitor.feed(data, input);
        if (input !== controlPort) return;

        // Named control first, raw note:/cc: second. A name is the more
        // specific statement of intent - `apc40.track3.clip1` means one
        // physical button, where `note:55` means that button on any of eight
        // tracks - and resolving it first is what lets the two live together:
        // every existing note:/cc: binding still works, and still catches
        // surfaces this app has no map for.
        const control = device.resolve(data);
        if (control && captureControl(control)) return;

        // Holds first within each vocabulary: a pad bound to a hold must not
        // also fire a one-shot action on the same note-on.
        if (control?.isDown !== null && control && applyHold(control.name, control.isDown)) return;
        const hold = midiDataToHold(data);
        if (hold && applyHold(hold.trigger, hold.isDown)) return;

        if (control?.isDown === true && dispatch(control.name)) return;
        const trigger = midiDataToTrigger(data);
        if (trigger) dispatch(trigger);
      });
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

    status.info(
      explainerStatus.startsWith('explainer blocked')
        ? `ready — Ctrl+Enter to play (${explainerStatus})`
        : 'ready — Ctrl+Enter to play',
    );
  },
  { onError: (err) => status.error(String(err?.message ?? err)) },
);
