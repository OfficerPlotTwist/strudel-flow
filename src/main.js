import { evaluateCode, initEngine, unlockAudio } from './engine.js';
import { enableMidi } from './midi.js';
import { createEditorPane } from './editor.js';
import { showBootScreen } from './ui/boot.js';

// Called before the gesture, on purpose. See engine.js.
initEngine({ onError: (msg) => console.error('[eval]', msg) });

const pane = createEditorPane(document.getElementById('editor-pane'));
const first = pane.addTab('song-1', '$: s("bd sd")\n\n$: note("<c a f e>(3,8)")');

pane.onActiveEdit((id) => evaluateCode(pane.getCode(id)));

showBootScreen(async () => {
  await unlockAudio();
  await enableMidi();
  pane.setActiveTab(first);
  await evaluateCode(pane.getCode(first));
});
