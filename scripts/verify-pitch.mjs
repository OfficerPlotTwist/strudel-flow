/**
 * Proves the note()->n().scale() conversion changed no PITCHES.
 *
 * verify-snippets.mjs cannot catch a wrong scale: the snippet still parses and
 * still makes sound, it just plays the wrong notes. This compares the MIDI a
 * converted pattern emits against the fingerprint snapshotted from the
 * original (scripts/pitch-baseline.json) and fails on any drift.
 *
 *   node scripts/verify-pitch.mjs   (needs `npm run dev` on :5173)
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { collectScaleExprs, fingerprint, OUT } from './pitch-lib.mjs';

const baseline = JSON.parse(readFileSync(OUT, 'utf8'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(process.argv[2] ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' });

const problems = [];
let checked = 0;
/** Snippets that were ALREADY degree-based before the conversion have no
 *  `note()` literal for snapshot-pitch.mjs to fingerprint, so they have no
 *  baseline. That is expected, not staleness - counting them keeps the
 *  failure list meaning "something is wrong". */
let preexisting = 0;

for (const { name, exprs, leftovers } of collectScaleExprs()) {
  const want = baseline[name];
  if (!want) {
    if (exprs.length) preexisting += 1;
    continue;
  }
  if (leftovers.length) {
    problems.push(`${name}: ${leftovers.length} note("...") left unconverted: ${leftovers.join(' | ')}`);
  }
  if (exprs.length !== want.length) {
    problems.push(`${name}: ${exprs.length} scale patterns, baseline has ${want.length}`);
    continue;
  }
  for (const [i, expr] of exprs.entries()) {
    const got = await fingerprint(page, expr);
    checked += 1;
    if (JSON.stringify(got) !== JSON.stringify(want[i].midi)) {
      problems.push(
        `${name}[${i}] PITCH DRIFT\n      was  note("${want[i].src}")\n      now  ${expr}` +
          `\n      want ${want[i].midi.join(' ')}\n      got  ${got.join(' ')}`,
      );
    }
  }
}

console.log(
  `compared ${checked} converted pitch patterns against the baseline` +
    ` (${preexisting} snippets were already degree-based, nothing to compare)`,
);
if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const p of problems) console.log(`  ${p}`);
  process.exitCode = 1;
} else {
  console.log('every converted pattern plays exactly the pitches it played before');
}
await browser.close();
