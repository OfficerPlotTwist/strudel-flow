import { chromium } from 'playwright';
const b = await chromium.launch({ headless: false, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ permissions: ['midi','midi-sysex'] });
const p = await ctx.newPage();
await p.addInitScript(() => {
  window.__tap = null;
  const wrap = (K) => class extends K {
    constructor(...a) { super(...a);
      const an = this.createAnalyser(); an.fftSize = 2048;
      if (!window.__tap) window.__tap = an;
      const dest = this.destination; const orig = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (t, ...r) { const x = orig.call(this, t, ...r);
        if (t === dest && this !== an) { try { orig.call(this, an); } catch {} } return x; };
    } };
  window.AudioContext = wrap(window.AudioContext);
});
await p.goto('http://localhost:5203', { waitUntil: 'domcontentloaded' });
await p.click('#boot');
await p.waitForSelector('#app:not([hidden])', { timeout: 120000 });
await p.waitForTimeout(8000);
const CASES = {
  'A block attack .001, no master':   '$: s("bd*2").attack(0.001).release(0.1)',
  'B block attack .001 + master 1.5': '$: s("bd*2").attack(0.001).release(0.1)\n\nall(x => x.attack(1.5))',
  'C block attack 1.5, no master':    '$: s("bd*2").attack(1.5).release(0.1)',
};
for (const [name, code] of Object.entries(CASES)) {
  const r = await p.evaluate(async ({ code }) => {
    const { evaluateCode, hushEngine } = await import('/src/engine.js');
    let ok = false; try { ({ success: ok } = await evaluateCode(code)); } catch (e) { return { err: String(e) }; }
    let peak = 0; const buf = new Float32Array(window.__tap.fftSize);
    const t0 = performance.now();
    while (performance.now() - t0 < 3000) {
      window.__tap.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      await new Promise((r) => setTimeout(r, 20));
    }
    hushEngine();
    return { ok, peak: Number(peak.toFixed(4)) };
  }, { code });
  console.log(String(name).padEnd(36), JSON.stringify(r));
  await p.waitForTimeout(400);
}
await b.close();
