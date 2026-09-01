// Static import: @strudel/webaudio registers a worklet as a module-level
// side effect. A lazy import after the first mousedown misses the worklet load.
import { getAudioContext, initAudioOnFirstClick } from '@strudel/webaudio';
import { initStrudel, evaluate, hush, samples } from '@strudel/web';
import { Drawer } from '@strudel/draw';
import '@strudel/midi';

let ready = null;
let repl = null;
let drawer = null;
let drawerStarted = false;

/**
 * Must be called at page load, BEFORE any user gesture. initStrudel registers
 * the document mousedown listener that unlocks audio; calling it from inside a
 * click handler spends the first click and requires a second one.
 *
 * `onDraw(haps, time)` is optional: if given, a single @strudel/draw Drawer is
 * created (and later started once, on first evaluate - see evaluateCode) to
 * drive one shared requestAnimationFrame loop reporting the haps currently
 * sounding. This never triggers evaluation.
 */
export function initEngine({ onError, onDraw } = {}) {
  if (onDraw) {
    drawer = new Drawer(onDraw, [-0.1, 0.1]);
  }
  ready = initStrudel({
    onEvalError: (err) => onError?.(String(err?.message ?? err)),
    prebake: async () => {
      // initStrudel loads NO samples by default: note(...) works, but
      // s("bd sd") is silent with only a log line. Load dirt-samples so
      // patterns pasted from strudel.cc make sound here. This is a network
      // fetch (GitHub) - offline or rate-limited it must NOT block startup,
      // since note(...) patterns work fine without any sample bank.
      try {
        await samples('github:tidalcycles/dirt-samples');
      } catch (err) {
        console.warn('[engine] sample bank failed to load; synths still work, s(...) will be silent', err);
      }
    },
  });
  ready.then((r) => {
    repl = r;
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

/**
 * Replace whatever is playing with `code`. Replace semantics are the default.
 * Returns the mini-notation locations the transpiler produced for this
 * evaluation (repl.state.miniLocations), for the caller to push into the
 * editor's highlight state.
 */
export async function evaluateCode(code) {
  await ready;
  await evaluate(code);
  // The scheduler has no pattern until the first evaluate() sets one; only
  // start the shared draw loop once that's guaranteed, and only ever once.
  if (drawer && !drawerStarted) {
    drawer.start(repl.scheduler);
    drawerStarted = true;
  }
  return repl.state.miniLocations;
}

export function hushEngine() {
  hush();
}
