import { evaluateCode, initEngine, unlockAudio } from './engine.js';
import { enableMidi, listInputs, listOutputs, onMidiMessage } from './midi.js';
import { createEditorPane } from './editor.js';
import { showBootScreen } from './ui/boot.js';
import { createLibraryPanel } from './ui/panel.js';
import { createStatus } from './ui/status.js';
import { createSettings } from './ui/settings.js';
import { createActions } from './actions.js';
import { defaultTriggerMap, keyEventToTrigger, midiDataToTrigger, resolveAction } from './triggers.js';

const status = createStatus(document.getElementById('status-strip'));

// Called before the gesture, on purpose. See engine.js.
initEngine({ onError: (msg) => status.error(msg) });

const pane = createEditorPane(document.getElementById('editor-pane'));
const first = pane.addTab('song-1', '$: s("bd sd")\n\n$: note("<c a f e>(3,8)")');

const panel = createLibraryPanel(document.getElementById('library-pane'), {
  onInsert: (code, kind, name) => {
    if (kind === 'songs') {
      // A saved song opens as its own page - it does not get pasted into
      // whatever tab happens to be open. Viewing it does not evaluate it;
      // the user still presses Ctrl+Enter to make it live.
      pane.viewTab(pane.addTab(name, code));
    } else {
      pane.insertAtCursor(code);
    }
  },
  getSongCode: () => pane.getCode(pane.getViewedId()),
  getSongName: () => pane.getTabs().find((t) => t.id === pane.getViewedId()).name,
});

pane.onActiveEdit((id) => evaluateCode(pane.getCode(id)));

const triggerMap = defaultTriggerMap();
const actions = createActions({ pane, panel, status });

function dispatch(trigger) {
  const name = resolveAction(triggerMap, trigger);
  if (name) actions[name]();
  return Boolean(name);
}

window.addEventListener('keydown', (event) => {
  if (dispatch(keyEventToTrigger(event))) event.preventDefault();
});

showBootScreen(
  async () => {
    await unlockAudio();
    const midiOk = await enableMidi();
    const outputs = listOutputs();
    const preferredOutput = outputs.find((name) => name.includes('loopMIDI')) ?? outputs[0];
    status.setMidi(midiOk ? (preferredOutput ?? 'no outputs') : 'not connected');
    for (const input of listInputs()) {
      onMidiMessage(input, (data) => {
        const trigger = midiDataToTrigger(data);
        if (trigger) dispatch(trigger);
      });
    }
    createSettings(document.getElementById('settings-pane'), {
      triggerMap,
      onPortPick: (name) => {
        pane.insertAtCursor(`.midi('${name}')`);
        status.setMidi(name);
      },
    });
    pane.setActiveTab(first);
    await evaluateCode(pane.getCode(first));
  },
  { onError: (err) => status.error(String(err?.message ?? err)) },
);
