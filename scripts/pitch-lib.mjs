/** Shared bits of the pitch snapshot/verify pair. */
import { readFileSync } from 'node:fs';

export const FILES = ['src/seed-blocks.js', 'src/seed-snippets.js'];
export const OUT = 'scripts/pitch-baseline.json';

/** `note(12)` / `note(.14)` are semitone offsets, not pitch sequences - they
 *  stay numeric through the conversion, so they are not fingerprinted. */
const NOTE_LITERAL = /\bnote\("([^"]*)"\)/g;
const SCALE_LITERAL = /\bn\("([^"]*)"\)((?:\s|\/\/[^\n]*\n)*)\.scale\("([^"]*)"\)/g;
const ENTRY = /^\s{2}\{\n\s{4}name: '([^']+)'/gm;

/** Splits a seed file into per-entry source chunks, keyed by snippet name. */
export function entrySources() {
  const out = [];
  for (const file of FILES) {
    const src = readFileSync(file, 'utf8');
    const marks = [...src.matchAll(ENTRY)];
    marks.forEach((m, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].index : src.length;
      out.push({ name: m[1], file, body: src.slice(m.index, end) });
    });
  }
  return out;
}

export function collectPitchLiterals() {
  return entrySources()
    .map(({ name, body }) => ({ name, literals: [...body.matchAll(NOTE_LITERAL)].map((m) => m[1]) }))
    .filter((e) => e.literals.length);
}

export function collectScaleExprs() {
  return entrySources().map(({ name, body }) => ({
    name,
    exprs: [...body.matchAll(SCALE_LITERAL)].map((m) => `n(${JSON.stringify(m[1])}).scale(${JSON.stringify(m[3])})`),
    leftovers: [...body.matchAll(NOTE_LITERAL)].map((m) => m[1]),
  }));
}

/** Queries a pitch expression in the browser and returns its MIDI fingerprint. */
export function fingerprint(page, src, cycles = 4) {
  return page.evaluate(async ([s, c]) => {
    const { pitches } = await import('/scripts/pitch-scope.js');
    try { return pitches(s, c); } catch (e) { return [`ERR ${String(e.message ?? e)}`]; }
  }, [src, cycles]);
}
