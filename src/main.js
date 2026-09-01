import { evaluateCode, initEngine, unlockAudio } from './engine.js';
import { enableMidi, listInputs, onMidiMessage } from './midi.js';
import { createEditorPane } from './editor.js';
import { showBootScreen } from './ui/boot.js';
import { createLibraryPanel } from './ui/panel.js';
import { createStatus } from './ui/status.js';
import { createActions } from './actions.js';
import { defaultTriggerMap, keyEventToTrigger, midiDataToTrigger, resolveAction } from './triggers.js';

const status = createStatus(document.getElementById('status-strip'));

// Called before the gesture, on purpose. See engine.js.
initEngine({ onError: (msg) => status.error(msg) });

const pane = createEditorPane(document.getElementById('editor-pane'));
const first = pane.addTab('song-1', '$: s("bd sd")\n\n$: note("<c a f e>(3,8)")');

const panel = createLibraryPanel(document.getElementById('library-pane'), {
  onInsert: (code) => pane.insertAtCursor(code),
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

showBootScreen(async () => {
  await unlockAudio();
  await enableMidi();
  for (const input of listInputs()) {
    onMidiMessage(input, (data) => {
      const trigger = midiDataToTrigger(data);
      if (trigger) dispatch(trigger);
    });
  }
  pane.setActiveTab(first);
  await evaluateCode(pane.getCode(first));
});
