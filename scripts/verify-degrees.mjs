/**
 * Proves src/degrees.js agrees with the REAL Strudel engine, in two ways.
 *
 * The migration reimplements @strudel/tonal's scale maths so it can run
 * synchronously, without a browser, on a library loaded from localStorage. If
 * that reimplementation drifts from the engine by even one interval, every
 * migrated snippet is silently transposed - it still parses, still sounds, and
 * every other check in this repo passes. So:
 *
 *   A. TABLE   every mode x 12 roots x degrees -14..21, my degreeToMidi()
 *              against what n(d).scale(root:mode) actually emits.
 *   B. CORPUS  the 41 real note("...") patterns the seeds used BEFORE the
 *              conversion (scripts/pitch-baseline.json), pushed through
 *              toDegrees() and checked against their recorded MIDI.
 *
 *   node scripts/verify-degrees.mjs   (needs `npm run dev` on :5173)
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { degreeToMidi, MODES, toDegrees } from '../src/degrees.js';
import { fingerprint, OUT } from './pitch-lib.mjs';

const ROOTS = ['c3', 'db3', 'd3', 'eb3', 'e3', 'f3', 'gb3', 'g3', 'ab3', 'a3', 'bb3', 'b3'];
const DEGREES = Array.from({ length: 36 }, (_, i) => i - 14);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(process.argv[2] ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' });

const problems = [];

// ---- A. interval tables ---------------------------------------------------
let tableChecks = 0;
for (const mode of Object.keys(MODES)) {
  for (const root of ROOTS) {
    const engine = await fingerprint(page, `n("${DEGREES.join(' ')}").scale("${root}:${mode}")`, 1);
    const rootValue = Number((await fingerprint(page, `note("${root}")`, 1))[0].split(':')[1]);
    const mine = DEGREES.map((d, i) =>
      `${(i / DEGREES.length).toFixed(4)}:${degreeToMidi(rootValue, mode, d)}`).sort();
    tableChecks += DEGREES.length;
    if (JSON.stringify(engine) !== JSON.stringify(mine)) {
      problems.push(`TABLE ${root}:${mode}\n      engine ${engine.join(' ')}\n      mine   ${mine.join(' ')}`);
    }
  }
}

// ---- B. the real pre-conversion corpus ------------------------------------
const baseline = JSON.parse(readFileSync(OUT, 'utf8'));
let corpusChecks = 0;
let refused = 0;
for (const [name, patterns] of Object.entries(baseline)) {
  for (const { src, midi } of patterns) {
    const { code, changed } = toDegrees(`note(${JSON.stringify(src)})`);
    if (!changed) { refused += 1; continue; }
    corpusChecks += 1;
    const got = await fingerprint(page, code, 4);
    if (JSON.stringify(got) !== JSON.stringify(midi)) {
      problems.push(
        `CORPUS ${name}\n      was  note("${src}")\n      now  ${code}` +
          `\n      want ${midi.join(' ')}\n      got  ${got.join(' ')}`,
      );
    }
  }
}

console.log(`table:  ${tableChecks} degree lookups across ${Object.keys(MODES).length} modes x ${ROOTS.length} roots`);
console.log(`corpus: ${corpusChecks} real patterns migrated and compared (${refused} refused as unconvertible)`);
if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const p of problems) console.log(`  ${p}`);
  process.exitCode = 1;
} else {
  console.log('\nsrc/degrees.js agrees with the engine, and migrates the real corpus losslessly');
}
await browser.close();
