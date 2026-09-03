/**
 * Snapshots the pitch content of every seeded snippet BEFORE the note->scale
 * conversion, so verify-pitch.mjs can prove the conversion changed no pitches.
 *
 * A wrong `.scale()` key is a SILENT failure: the snippet still parses, still
 * makes sound, and verify-snippets.mjs passes it. Only comparing actual MIDI
 * output catches it. So the pitch literals are fingerprinted here and the
 * fingerprints are what the conversion is held to.
 *
 * SPENT: the conversion is done, so no `note("...")` literals remain to
 * fingerprint and re-running this would write an empty baseline over the
 * proof. Kept because it is how the baseline was made, and how a future
 * absolute-pitch -> scale-degree conversion would make a new one.
 *
 *   node scripts/snapshot-pitch.mjs   (needs `npm run dev` on :5173)
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { collectPitchLiterals, fingerprint, OUT } from './pitch-lib.mjs';

const entries = collectPitchLiterals();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(process.argv[2] ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' });

const snap = {};
for (const { name, literals } of entries) {
  snap[name] = [];
  for (const lit of literals) {
    snap[name].push({ src: lit, midi: await fingerprint(page, `note(${JSON.stringify(lit)})`) });
  }
}
writeFileSync(OUT, `${JSON.stringify(snap, null, 2)}\n`);
console.log(`snapshotted ${Object.keys(snap).length} snippets, ` +
  `${Object.values(snap).flat().length} pitch patterns -> ${OUT}`);
await browser.close();
