#!/usr/bin/env node
/**
 * Independently re-checks every entry in the FX library.
 *
 * The library was written by twelve separate agents, each of which reported
 * its own work as correct. This script exists because that is exactly the
 * claim worth not taking on trust: a hallucinated function name or an
 * unbalanced paren is silent until the moment it is approved onto a live
 * pattern in front of a room.
 *
 * Checks, per entry:
 *   - the chain is a fragment (starts with `.`)
 *   - 1 to 4 slots, each with its default inside its own range
 *   - `log` only where the range is entirely positive
 *   - every identifier used is a real Strudel function
 *   - the chain is valid JS at its defaults AND at both knob extremes
 *
 * Run: npm run verify:fx
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FX_CATEGORIES } from '../src/seed-fx/index.js';
import { defaultValues, knobToValue, parseSlots, renderChain } from '../src/fx.js';

const here = dirname(fileURLToPath(import.meta.url));
const docs = JSON.parse(readFileSync(join(here, '..', 'src', 'strudel-docs.json'), 'utf8'));
const known = new Set(Object.keys(docs));

/**
 * Identifiers that are legitimately not Strudel functions: JavaScript itself,
 * and the conventional name for an arrow function's pattern argument.
 */
const IGNORED = new Set(['x', 'y', 'a', 'b', 'true', 'false', 'null', 'undefined']);

/** Every identifier in a rendered chain that could be a Strudel function. */
function identifiers(chain) {
  // Strings carry mini-notation and sample names, not function references.
  const withoutStrings = chain.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  return [...new Set(withoutStrings.match(/[A-Za-z_$][\w$]*/g) ?? [])].filter(
    (name) => !IGNORED.has(name),
  );
}

const problems = [];
let entryCount = 0;

for (const category of FX_CATEGORIES) {
  const names = new Set();
  if (category.entries.length !== 12) {
    problems.push(`${category.name}: has ${category.entries.length} entries, expected 12`);
  }
  for (const entry of category.entries) {
    entryCount += 1;
    const where = `${category.name}/${entry.name}`;

    if (names.has(entry.name)) problems.push(`${where}: duplicate name within category`);
    names.add(entry.name);

    if (!entry.code.startsWith('.')) {
      problems.push(`${where}: chain must start with "." - got ${entry.code.slice(0, 20)}`);
    }

    const slots = parseSlots(entry.code);
    if (slots.length < 1 || slots.length > 4) {
      problems.push(`${where}: ${slots.length} slots, expected 1-4`);
    }
    for (const slot of slots) {
      if (slot.min >= slot.max) problems.push(`${where}: slot "${slot.label}" has min >= max`);
      if (slot.default < slot.min || slot.default > slot.max) {
        problems.push(`${where}: slot "${slot.label}" default ${slot.default} outside its range`);
      }
      if (slot.log && slot.min <= 0) {
        problems.push(`${where}: slot "${slot.label}" is log with a non-positive minimum`);
      }
    }

    // Render at defaults and at both ends of every knob. An entry that only
    // parses at its default value is an entry that breaks the first time
    // somebody turns a knob.
    const extremes = [
      defaultValues(entry.code),
      slots.map((slot) => knobToValue(slot, 0)),
      slots.map((slot) => knobToValue(slot, 127)),
    ];
    for (const values of extremes) {
      const rendered = renderChain(entry.code, values);
      if (/<|>/.test(rendered.replace(/=>/g, ''))) {
        problems.push(`${where}: unfilled slot left in "${rendered}"`);
      }
      try {
        // Parsed, never run: `p` stands in for the pattern the chain attaches
        // to, so a syntax error throws here and a missing method does not.
        new Function('p', `return p${rendered}`);
      } catch (err) {
        problems.push(`${where}: not valid JS - ${err.message}\n    ${rendered}`);
      }
    }

    for (const name of identifiers(renderChain(entry.code))) {
      if (!known.has(name)) {
        problems.push(`${where}: "${name}" is not a function in strudel-docs.json`);
      }
    }
  }
}

console.log(`checked ${entryCount} entries across ${FX_CATEGORIES.length} categories`);
if (problems.length === 0) {
  console.log('all clear');
  process.exit(0);
}
console.error(`\n${problems.length} problem(s):\n`);
for (const problem of problems) console.error(`  - ${problem}`);
process.exit(1);
