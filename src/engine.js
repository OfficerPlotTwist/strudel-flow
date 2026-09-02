// Static import: @strudel/webaudio registers a worklet as a module-level
// side effect. A lazy import after the first mousedown misses the worklet load.
import { getAudioContext, initAudioOnFirstClick } from '@strudel/webaudio';
import { initStrudel, evaluate, hush, samples, aliasBank, registerZZFXSounds, soundMap } from '@strudel/web';
import { Drawer } from '@strudel/draw';
import '@strudel/midi';

/**
 * Loads public/samples/local.json (written by scripts/import-sample.mjs) if
 * present. A missing file is the expected state on a fresh clone with no
 * imports yet, so it must NOT surface as a warning: fetch it directly (rather
 * than via superdough's samples(url), which console.errors on a failed
 * fetch) and treat anything other than a real JSON payload as "nothing to
 * load". Vite's dev server SPA-fallback complicates this: an unmatched path
 * resolves to a 200 `text/html` response (index.html), not a 404, whenever
 * the request's Accept header lacks "text/html" - which is exactly what
 * fetch() sends by default (Accept: */*). So `res.ok` alone isn't enough;
 * also check the content-type, and treat a JSON-parse failure the same way
 * rather than letting it throw out to prebake's warning path.
 */
async function loadLocalSamples() {
  let res;
  try {
    res = await fetch('/samples/local.json');
  } catch (err) {
    console.debug('[engine] local samples: fetch failed, skipping', err);
    return;
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('json')) {
    console.debug('[engine] local samples: none found, skipping');
    return;
  }
  let json;
  try {
    json = await res.json();
  } catch (err) {
    console.debug('[engine] local samples: response was not valid JSON, skipping', err);
    return;
  }
  await samples(json, json._base);
}

let ready = null;
let repl = null;
let drawer = null;
let drawerStarted = false;
let onDrawCallback = null;

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
  onDrawCallback = onDraw ?? null;
  if (onDraw) {
    drawer = new Drawer(onDraw, [-0.1, 0.1]);
  }
  ready = initStrudel({
    onEvalError: (err) => onError?.(String(err?.message ?? err)),
    prebake: async () => {
      // initStrudel loads NO samples by default: note(...) works, but
      // s("bd sd") is silent with only a log line. Load the same bank set
      // strudel.cc's own prebake loads (see @strudel/repl/prebake.mjs) so
      // patterns pasted from strudel.cc make sound here. Every load below is
      // independently resilient - a failure of any one bank (network down,
      // GitHub rate-limited, offline boot) must log and continue, never
      // block startup or the other banks. registerSynthSounds() already ran
      // in @strudel/web's defaultPrebake, so oscillator sounds (sine/
      // sawtooth/square/triangle) work even if every bank below fails.
      const doughSamples = 'https://raw.githubusercontent.com/felixroos/dough-samples/main';
      const uzuDrumkit = 'https://raw.githubusercontent.com/tidalcycles/uzu-drumkit/main';
      const drumAliases = 'https://raw.githubusercontent.com/todepond/samples/main/tidal-drum-machines-alias.json';

      const banks = [
        ['zzfx synths', () => registerZZFXSounds()],
        // @strudel/soundfonts must be imported dynamically - a static
        // import throws under SSR ("window is not defined").
        ['soundfonts', () => import('@strudel/soundfonts').then(({ registerSoundfonts }) => registerSoundfonts())],
        ['tidal-drum-machines', () => samples(`${doughSamples}/tidal-drum-machines.json`)],
        ['piano', () => samples(`${doughSamples}/piano.json`)],
        ['dirt-samples', () => samples(`${doughSamples}/Dirt-Samples.json`)],
        ['vcsl', () => samples(`${doughSamples}/vcsl.json`)],
        ['mridangam', () => samples(`${doughSamples}/mridangam.json`)],
        ['strudel', () => samples(`${uzuDrumkit}/strudel.json`)],
        // Locally-imported samples (scripts/import-sample.mjs writes this file
        // under public/samples/). It's absent on a fresh clone with no
        // imports yet, so a 404 here is expected, not an error - swallow it
        // quietly (debug-level only) rather than warning on every boot.
        ['local samples', () => loadLocalSamples()],
      ];

      await Promise.all(
        banks.map(async ([name, load]) => {
          try {
            await load();
          } catch (err) {
            console.warn(`[engine] "${name}" bank failed to load; continuing`, err);
          }
        }),
      );

      // Aliases only make sense once the drum machine bank above is loaded;
      // run it after, and keep it just as resilient.
      try {
        await aliasBank(drumAliases);
      } catch (err) {
        console.warn('[engine] drum-machine alias bank failed to load; continuing', err);
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
 * `@strudel/web`'s evaluate() swallows transpile/eval errors (it calls
 * onEvalError and resolves anyway), so `repl.state.miniLocations` on failure
 * still holds whatever the PREVIOUS successful evaluation left there. Report
 * success explicitly (repl.mjs's `evaluate()` sets `state.evalError` on the
 * catch path and clears it - `evalError: undefined` - on the success path)
 * so callers never paint stale/foreign mini-locations onto the wrong tab.
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
  const success = !repl.state.evalError;
  return { success, miniLocations: success ? repl.state.miniLocations : null };
}

/** Stop playback AND stop showing whatever was last outlined - nothing should
 *  claim to be sounding once everything is silent. */
export function hushEngine() {
  hush();
  if (drawer) {
    drawer.stop();
  }
  drawerStarted = false;
  // Clear via the same path a real frame would use, so there's no second
  // highlight-clearing mechanism to keep in sync.
  onDrawCallback?.([], 0);
}

/**
 * A live, read-only snapshot of superdough's sound registry (soundMap, a
 * nanostores map re-exported all the way from superdough -> @strudel/webaudio
 * -> @strudel/web). This is NOT app data: it reflects whatever prebake has
 * managed to load at call time, so it can grow as banks finish loading async
 * and shrink to just synths on an offline boot. Never cache this list -
 * always read soundMap.get() fresh.
 *
 * Returns entries sorted by name: { name, type }[], where type is whatever
 * superdough's registerSound() recorded ('synth', 'sample', 'wavetable', ...).
 */
export function getSoundEntries() {
  const dict = soundMap.get();
  return Object.keys(dict)
    .sort()
    .map((name) => ({ name, type: dict[name]?.data?.type ?? 'unknown' }));
}
