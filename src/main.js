import { evaluateCode, initEngine, unlockAudio } from './engine.js';
import { showBootScreen } from './ui/boot.js';

// Called before the gesture, on purpose. See engine.js.
initEngine({ onError: (msg) => console.error('[eval]', msg) });

showBootScreen(async () => {
  await unlockAudio();
  // MILESTONE PROBE: synth path (no samples) and sample path (needs prebake).
  await evaluateCode('$: note("<c a f e>(3,8)").jux(rev)\n$: s("bd sd")');
});
