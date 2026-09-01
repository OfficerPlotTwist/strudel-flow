import { evaluateCode, initEngine, unlockAudio } from './engine.js';
import { showBootScreen } from './ui/boot.js';
import { enableMidi, listOutputs } from './midi.js';

// Called before the gesture, on purpose. See engine.js.
initEngine({ onError: (msg) => console.error('[eval]', msg) });

showBootScreen(async () => {
  await unlockAudio();
  // MILESTONE PROBE: synth path (no samples), sample path (needs prebake), and MIDI output.
  const ok = await enableMidi();
  console.log('[midi] enabled:', ok, 'outputs:', listOutputs());
  const port = listOutputs().find((n) => n.includes('loopMIDI'));
  await evaluateCode(
    port
      ? `$: note("c e g").midichan(1).midi('${port}')`
      : '$: note("<c a f e>(3,8)")',
  );
});
