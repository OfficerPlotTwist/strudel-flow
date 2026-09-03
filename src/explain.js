import docs from './strudel-docs.json';

/**
 * One pass that recognises the things an identifier must NOT be mistaken for.
 * Order matters: comments and string literals are matched (and discarded)
 * BEFORE identifiers, so the `bd` and `sd` inside s("bd sd") are mini-notation
 * words, not function calls, and a commented-out `.fast(2)` never claims to be
 * part of the running song.
 */
const TOKEN =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*/g;

const IDENTIFIER_START = /[A-Za-z_$]/;

/**
 * Every documented Strudel function used in `code`, in source order, one entry
 * per occurrence (a function used three times appears three times - callers
 * that want a unique list should dedupe by `name`).
 */
export function scanFunctions(code, lookup = docs) {
  const found = [];
  TOKEN.lastIndex = 0;
  let match;
  while ((match = TOKEN.exec(code))) {
    const text = match[0];
    if (!IDENTIFIER_START.test(text[0])) continue;
    if (!Object.prototype.hasOwnProperty.call(lookup, text)) continue;
    found.push({ name: text, from: match.index, to: match.index + text.length });
  }
  return found;
}

/** Unique function names used in `code`, in first-use order. */
export function uniqueFunctions(code, lookup = docs) {
  const seen = new Set();
  const out = [];
  for (const hit of scanFunctions(code, lookup)) {
    if (seen.has(hit.name)) continue;
    seen.add(hit.name);
    out.push(hit);
  }
  return out;
}

/**
 * The function the cursor is "on". A cursor inside the name matches it
 * directly; otherwise it belongs to the nearest function to its LEFT, which is
 * what makes the explainer track sensibly while typing arguments - the caret
 * in `.fast(2|)` is still asking about `fast`.
 */
export function functionAt(code, pos, lookup = docs) {
  let best = null;
  for (const hit of scanFunctions(code, lookup)) {
    if (hit.from <= pos && pos <= hit.to) return hit;
    if (hit.from <= pos) best = hit;
  }
  return best;
}

/**
 * Doc entry for `name`, with aliases resolved to the entry they point at so an
 * alias shows the same signature and example as its canonical function while
 * still reporting which name was actually written.
 */
export function describe(name, lookup = docs) {
  const entry = lookup[name];
  if (!entry) return null;
  const canonical = entry.aliasOf ?? name;
  const source = entry.aliasOf ? (lookup[entry.aliasOf] ?? entry) : entry;
  return {
    name,
    canonical,
    isAlias: Boolean(entry.aliasOf),
    description: source.description,
    params: source.params ?? [],
    example: source.example ?? '',
    package: source.package,
    // Baked in at build time by scripts/build-docs.mjs. Taken from `source`,
    // so an alias reports the same category as the name it points at.
    category: source.category ?? 'other',
  };
}

/** `fast(factor)` - the name as written plus its documented parameter names. */
export function signatureOf(info) {
  return `${info.name}(${info.params.join(', ')})`;
}

/** Every documented name, sorted - the browsable index behind the FUNCS tab. */
export function allFunctionNames(lookup = docs) {
  return Object.keys(lookup).sort();
}

export { docs };

/**
 * The twelve buckets, in the order the library shows them: the ones reached
 * for while writing a pattern first, the ones configured once last. `other` is
 * a real bucket, not an error state - it holds the handful of names no rule
 * claims.
 */
export const CATEGORY_ORDER = [
  'pattern', 'harmony', 'sample', 'synth', 'fx', 'filter',
  'envelope', 'signal', 'transport', 'routing', 'midi', 'visual', 'other',
];

/** Every documented name, grouped by category, in CATEGORY_ORDER. Empty groups are dropped. */
export function groupByCategory(infos) {
  const buckets = new Map(CATEGORY_ORDER.map((c) => [c, []]));
  for (const info of infos) {
    if (!buckets.has(info.category)) buckets.set(info.category, []);
    buckets.get(info.category).push(info);
  }
  return [...buckets.entries()].filter(([, list]) => list.length > 0);
}
