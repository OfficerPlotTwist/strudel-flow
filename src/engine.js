// Static import: @strudel/webaudio registers a worklet as a module-level
// side effect. A lazy import after the first mousedown misses the worklet load.
import { getAudioContext, initAudioOnFirstClick } from '@strudel/webaudio';
import { initStrudel, evaluate, hush, samples } from '@strudel/web';
import '@strudel/midi';

let ready = null;

/**
 * Must be called at page load, BEFORE any user gesture. initStrudel registers
 * the document mousedown listener that unlocks audio; calling it from inside a
 * click handler spends the first click and requires a second one.
 */
export function initEngine({ onError } = {}) {
  ready = initStrudel({
    onEvalError: (err) => onError?.(String(err?.message ?? err)),
    prebake: async () => {
      // initStrudel loads NO samples by default: note(...) works, but
      // s("bd sd") is silent with only a log line. Load dirt-samples so
      // patterns pasted from strudel.cc make sound here.
      await samples('github:tidalcycles/dirt-samples');
    },
  });
  return ready;
}

/** Resume the AudioContext. Call from the boot screen's click handler. */
export async function unlockAudio() {
  await initAudioOnFirstClick();
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  await ready;
}

/** Replace whatever is playing with `code`. Replace semantics are the default. */
export async function evaluateCode(code) {
  await ready;
  await evaluate(code);
}

export function hushEngine() {
  hush();
}
