/**
 * Evaluates every seeded snippet against the REAL Strudel engine, then LISTENS
 * to the master bus to confirm it actually made a sound.
 *
 * A snippet that does not parse is worse than no snippet: it fails inside the
 * user's song, mid-set, and the error names a line they did not write. One
 * that parses but references an unregistered sound is nearly as bad - it is
 * silently dead and nothing reports it. Unit tests catch neither: only the
 * real transpiler knows whether `lpq` exists, and only the real audio graph
 * knows whether `gm_music_box` was ever registered.
 *
 * It reaches the engine by importing the dev server's own module URL, which is
 * the same URL main.js imported - so it resolves to the ALREADY-INITIALISED
 * module instance, with prebake finished and the banks loaded, and no test
 * hook has to be added to the app to make this work.
 *
 *   node scripts/verify-snippets.mjs [url]
 */
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5173';
/** Peak below this is silence, not a quiet part. ~-60 dBFS. */
const SILENT = 0.001;
/** How long to listen to each snippet. Long enough for a sparse 4-cycle phrase. */
const LISTEN_MS = 2600;

const browser = await chromium.launch({
  headless: false, // chromium-headless-shell hangs inside initAudio
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({ permissions: ['midi', 'midi-sysex'] });
const page = await context.newPage();

// Tap the master bus WITHOUT replacing ctx.destination. Replacing it breaks
// superdough, which reads maxChannelCount off the destination to size its
// output node - it gets undefined, and every note dies with "channelCount (0)
// is outside the range [1, 32]". So fan out in parallel instead: anything
// wired to the destination is also wired to an analyser.
await page.addInitScript(() => {
  window.__tap = null;
  const wrap = (Klass) => class extends Klass {
    constructor(...args) {
      super(...args);
      const analyser = this.createAnalyser();
      analyser.fftSize = 2048;
      if (!window.__tap) window.__tap = analyser;
      const dest = this.destination;
      const orig = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (target, ...rest) {
        const r = orig.call(this, target, ...rest);
        if (target === dest && this !== analyser) {
          try { orig.call(this, analyser); } catch { /* fan-out refused */ }
        }
        return r;
      };
    }
  };
  window.AudioContext = wrap(window.AudioContext);
  if (window.webkitAudioContext) window.webkitAudioContext = wrap(window.webkitAudioContext);
});

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.click('#boot');
await page.waitForSelector('#app:not([hidden])', { timeout: 120000 });
// Let prebake finish loading banks - a snippet using a sample from a bank that
// has not landed yet would fail for a reason that is not the snippet's fault.
await page.waitForTimeout(8000);

const seeds = await page.evaluate(async () => {
  const { SEED_SNIPPETS } = await import('/src/seed-snippets.js');
  return SEED_SNIPPETS.map((s) => ({
    name: s.name,
    category: s.category ?? 'other',
    code: s.code,
    kind: s.kind ?? 'snippets',
  }));
});

// One page.evaluate PER SNIPPET. A single call wrapping the whole loop runs
// for minutes and gets torn down mid-flight ("Target page ... has been
// closed"); per-snippet calls also make the progress line possible.
const results = [];
for (const [i, seed] of seeds.entries()) {
  const r = await page.evaluate(
    async ({ code, listenMs }) => {
      const { evaluateCode, hushEngine } = await import('/src/engine.js');
      // The engine reports failure through a flag, but the MESSAGE only ever
      // reaches the console - and the message is the useful half.
      const said = [];
      const origError = console.error;
      const origWarn = console.warn;
      console.error = (...a) => { said.push(a.map(String).join(' ')); origError(...a); };
      console.warn = (...a) => { said.push(a.map(String).join(' ')); origWarn(...a); };

      let success = false;
      let thrown = null;
      try {
        ({ success } = await evaluateCode(code));
      } catch (err) {
        thrown = String(err?.message ?? err);
      }
      console.error = origError;
      console.warn = origWarn;

      let peak = 0;
      if (success && !thrown && window.__tap) {
        const buf = new Float32Array(window.__tap.fftSize);
        const t0 = performance.now();
        while (performance.now() - t0 < listenMs) {
          window.__tap.getFloatTimeDomainData(buf);
          for (let n = 0; n < buf.length; n += 1) peak = Math.max(peak, Math.abs(buf[n]));
          await new Promise((res) => setTimeout(res, 25));
        }
      }
      hushEngine();
      return {
        success: success && !thrown,
        peak: Number(peak.toFixed(4)),
        detail: thrown ?? said.filter((s) => !/deprecat/i.test(s)).slice(0, 2).join(' | '),
      };
    },
    { code: seed.code, listenMs: LISTEN_MS },
  );
  results.push({ ...seed, ...r });
  const mark = !r.success ? 'FAIL' : r.peak < SILENT ? 'MUTE' : ' ok ';
  console.log(`  ${mark} ${String(i + 1).padStart(2)}/${seeds.length} ${seed.name.padEnd(22)} peak ${r.peak}`);
  await page.waitForTimeout(250);
}

const failed = results.filter((r) => !r.success);
// A song seed is a whole arrangement, not a droppable block; it is verified
// for parsing but its own transport may legitimately not line up in 2.6s.
const silent = results.filter((r) => r.success && r.kind === 'snippets' && r.peak < SILENT);

const byCat = {};
for (const r of results) {
  const b = (byCat[r.category] ??= { ok: 0, bad: 0, mute: 0 });
  if (!r.success) b.bad += 1;
  else if (r.kind === 'snippets' && r.peak < SILENT) b.mute += 1;
  else b.ok += 1;
}

console.log(`\nevaluated ${results.length} snippets\n`);
for (const [cat, n] of Object.entries(byCat)) {
  console.log(
    `  ${cat.padEnd(10)} ${String(n.ok).padStart(3)} ok` +
      `${n.bad ? `  ${n.bad} FAILED` : ''}${n.mute ? `  ${n.mute} SILENT` : ''}`,
  );
}
if (failed.length) {
  console.log(`\n${failed.length} FAILED TO EVALUATE:`);
  for (const f of failed) console.log(`  ${f.name.padEnd(22)} ${f.detail.slice(0, 160)}`);
}
if (silent.length) {
  console.log(`\n${silent.length} PARSED BUT MADE NO SOUND:`);
  for (const f of silent) console.log(`  ${f.name.padEnd(22)} peak ${f.peak}`);
}
if (failed.length || silent.length) process.exitCode = 1;
else console.log('\nall snippets evaluate AND make sound');

await browser.close();
