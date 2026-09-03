import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? '.';

const browser = await chromium.launch({
  headless: process.env.SMOKE_HEADED ? false : true,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'],
});
// Without this the boot sequence hangs forever on enableMidi()'s permission
// prompt, which nothing in a headless run can answer.
const context = await browser.newContext({ permissions: ['midi', 'midi-sysex'] });
const page = await context.newPage();

const errors = [];
page.on('pageerror', (e) => { errors.push(`pageerror: ${e.message}`); console.log('  !! pageerror:', e.message); });
const log = [];
page.on('console', (m) => {
  log.push(m.text());
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

const step = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}: ${e.message}`);
    process.exitCode = 1;
  }
};

await page.goto(URL, { waitUntil: 'networkidle' });

console.log('boot');
await step('boot screen click reveals app', async () => {
  await page.click('#boot');
  await page.waitForSelector('#app:not([hidden])', { timeout: 90000 });
});
await page.waitForTimeout(2500);

console.log('silent launch');
await step('boots silent - nothing is evaluated until triggered', async () => {
  const started = log.some((l) => /\[cyclist\] start|\[eval\] code updated/.test(l));
  if (started) throw new Error('something evaluated on launch');
  const strip = await page.locator('#status-strip').innerText();
  if (!/Ctrl\+Enter/.test(strip)) throw new Error(`status strip said: ${strip}`);
});
await step('typing in the active song does NOT start playback', async () => {
  await page.click('.cm-content');
  await page.keyboard.type('// still silent');
  await page.waitForTimeout(800);
  if (log.some((l) => /\[cyclist\] start/.test(l))) throw new Error('an edit started the transport');
  // Put the buffer back: later steps assert on its exact contents, and a
  // stray comment left here fails the Ctrl+M round-trip rather than the code.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
});
await step('Ctrl+Enter is what starts it', async () => {
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(3000);
  if (!log.some((l) => /\[cyclist\] start/.test(l))) throw new Error('Ctrl+Enter did not start the transport');
});

console.log('snippet library');
await step('SNIPPETS is grouped into beat / pads / synths / melodies', async () => {
  await page.click('.lib-tab:has-text("SNIPPETS")');
  await page.waitForTimeout(300);
  const cats = (await page.locator('.lib-func-cat-btn').allTextContents()).map((c) =>
    c.replace(/^[^a-z]*/, '').trim(),
  );
  for (const want of ['beat', 'pads', 'synths', 'melodies']) {
    if (!cats.includes(want)) throw new Error(`missing ${want}: ${JSON.stringify(cats)}`);
  }
  const n = await page.locator('.lib-item').count();
  if (n < 40) throw new Error(`only ${n} snippets listed`);
});
await step('a snippet category collapses and re-expands', async () => {
  const before = await page.locator('.lib-item').count();
  await page.click('.lib-func-cat-btn:has-text("beat")');
  await page.waitForTimeout(200);
  const after = await page.locator('.lib-item').count();
  if (after >= before) throw new Error(`collapse hid nothing: ${before} -> ${after}`);
  await page.click('.lib-func-cat-btn:has-text("beat")');
  await page.waitForTimeout(200);
  if ((await page.locator('.lib-item').count()) !== before) throw new Error('did not restore');
});

console.log('funcs tab');
await step('FUNCS tab exists and lists functions', async () => {
  await page.click('.lib-tab:has-text("FUNCS")');
  await page.waitForSelector('.lib-func', { timeout: 5000 });
  const n = await page.locator('.lib-func').count();
  if (n < 100) throw new Error(`only ${n} functions listed`);
});
await step('FUNCS is grouped into collapsible categories', async () => {
  const cats = await page.locator('.lib-func-cat-btn').allTextContents();
  const names = cats.map((c) => c.replace(/^[^a-z]*/, '').trim());
  for (const want of ['pattern', 'fx', 'filter', 'harmony', 'sample']) {
    if (!names.includes(want)) throw new Error(`missing category ${want}: ${JSON.stringify(names)}`);
  }
  if (names.length < 10) throw new Error(`only ${names.length} categories`);
});
await step('clicking a category heading collapses its section', async () => {
  const before = await page.locator('.lib-func').count();
  await page.click('.lib-func-cat-btn:has-text("pattern")');
  await page.waitForTimeout(200);
  const after = await page.locator('.lib-func').count();
  if (after >= before) throw new Error(`collapse did not hide rows: ${before} -> ${after}`);
  await page.click('.lib-func-cat-btn:has-text("pattern")');
  await page.waitForTimeout(200);
  if ((await page.locator('.lib-func').count()) !== before) throw new Error('re-expand did not restore rows');
});
await step('filter narrows to a named function', async () => {
  await page.fill('.lib-sound-filter', 'sometimesBy');
  await page.waitForTimeout(200);
  const names = await page.locator('.lib-func .lib-name').allTextContents();
  if (!names.includes('sometimesBy')) throw new Error(`got ${JSON.stringify(names)}`);
});
await step('clicking a function expands its description', async () => {
  // Exact row: the filter also matches functions whose DESCRIPTION mentions
  // sometimesBy (almostAlways and friends), which is the intended behaviour.
  await page.click('.lib-func .lib-name:text-is("sometimesBy")');
  await page.waitForSelector('.lib-func-detail', { timeout: 3000 });
  const text = await page.locator('.lib-func-detail').innerText();
  if (!/probability/i.test(text)) throw new Error(`detail was: ${text.slice(0, 120)}`);
});

console.log('explainer popout');
await step('Ctrl+e opens a second window describing the playing song', async () => {
  const [popup] = await Promise.all([
    context.waitForEvent('page', { timeout: 5000 }),
    page.keyboard.press('Control+e'),
  ]);
  await popup.waitForSelector('.ex-list li', { timeout: 5000 });
  const used = await popup.locator('.ex-list .n').allTextContents();
  if (!used.includes('s') || !used.includes('note')) {
    throw new Error(`functions listed: ${JSON.stringify(used)}`);
  }
  await popup.screenshot({ path: `${OUT}/explainer.png` });
});

console.log('multi-block comment');
await step('Ctrl+m over a full selection comments every block', async () => {
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+m');
  await page.waitForTimeout(300);
  const text = await page.locator('.cm-content').innerText();
  const live = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
  if (live.length) throw new Error(`still live: ${JSON.stringify(live)}`);
});
await step('a second Ctrl+m restores every block', async () => {
  await page.keyboard.press('Control+m');
  await page.waitForTimeout(300);
  const text = await page.locator('.cm-content').innerText();
  if (text.includes('//')) throw new Error(`still commented: ${text}`);
});

console.log('midi control surface');
await step('settings offers a MIDI control surface separate from pattern ports', async () => {
  // <details> is collapsed on load, so open it before reading its contents.
  await page.click('.settings summary');
  await page.waitForTimeout(200);
  const text = await page.locator('.settings').innerText();
  if (!/MIDI control surface/.test(text)) throw new Error(text.slice(0, 200));
  if (!/pattern inputs|MIDI in: none/.test(text)) throw new Error('no pattern-input line');
});

console.log('hold keys');
await step('settings shows five block-hold rows and per-tab add/solo', async () => {
  const keys = await page.locator('.hold-key').count();
  if (keys < 7) throw new Error(`only ${keys} hold-key buttons (want 5 block + 2 per tab)`);
});
await step('holding a block key re-evaluates without editing the buffer', async () => {
  const before = await page.locator('.cm-content:visible').innerText();
  await page.keyboard.down('F2');
  await page.waitForTimeout(400);
  await page.keyboard.up('F2');
  await page.waitForTimeout(400);
  const after = await page.locator('.cm-content:visible').innerText();
  if (before !== after) throw new Error('buffer changed during a hold');
});

console.log('get got import');
await step('Get Got is seeded as a song, not a snippet', async () => {
  await page.click('.lib-tab:has-text("SONGS")');
  await page.waitForTimeout(200);
  const names = await page.locator('.lib-name').allTextContents();
  if (!names.includes('get_got')) throw new Error(`songs: ${JSON.stringify(names)}`);
});

console.log('rip keys');
await step('F6 fades the selection out and parks it in a bottom-bar tab', async () => {
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  const before = await page.locator('.cm-content:visible').innerText();
  await page.keyboard.press('F6');
  // The rip fades over 4 cycles before it lands; at the default cpm that is a
  // few seconds. Wait past it, plus the animation.
  await page.waitForTimeout(9000);
  const bottom = await page.locator('.tab-bar-bottom .tab').allTextContents();
  if (!bottom.includes('to return')) throw new Error(`bottom bar: ${JSON.stringify(bottom)}`);
  const after = await page.locator('.cm-content:visible').innerText();
  if (after.trim() === before.trim()) throw new Error('source tab still holds the ripped blocks');
});
await step('the ripped text landed in the holding tab intact', async () => {
  await page.click('.tab-bar-bottom .tab:has-text("to return")');
  await page.waitForTimeout(300);
  const text = await page.locator('.cm-content:visible').innerText();
  if (!text.includes('bd sd')) throw new Error(`holding tab holds: ${text.slice(0, 120)}`);
  // The fade chain is a RENDER-time transform - it must never be written into
  // a document, or a ripped block would come back permanently silenced.
  if (text.includes('.mul(gain(')) throw new Error('fade chain leaked into the buffer');
});
await step('the fade expression actually evaluates in Strudel', async () => {
  const bad = errors.filter((e) => /isaw|not defined|is not a function/.test(e));
  if (bad.length) throw new Error(bad.slice(0, 3).join(' | '));
});

await page.screenshot({ path: `${OUT}/app.png`, fullPage: false });

console.log('\nerrors:');
const noise = /favicon|AudioContext|autoplay|Failed to load resource/i;
const real = errors.filter((e) => !noise.test(e));
console.log(real.length ? real.slice(0, 12).join('\n') : '  (none)');
if (real.length) process.exitCode = 1;

await browser.close();
