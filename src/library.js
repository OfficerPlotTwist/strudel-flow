export const KINDS = ['snippets', 'songs'];

/**
 * Snippet categories, in the order the library shows them. A snippet is a
 * BLOCK you drop into a song, and these are the four things a block usually
 * is: the rhythm, the sustained harmony under it, the voice playing it, and
 * the line on top.
 */
export const CATEGORIES = ['beat', 'pads', 'synths', 'melodies'];

/**
 * Where anything without a category goes - every entry saved before categories
 * existed, and every song (a song is a whole arrangement, not one of the four
 * block roles above). A real bucket, not an error state.
 */
export const UNCATEGORIZED = 'other';

export function emptyLibrary() {
  return { snippets: [], songs: [] };
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function findEntry(lib, kind, name) {
  return lib[kind].find((entry) => entry.name === name);
}

/**
 * Adds an entry. If `name` is taken, the existing entry is renamed to
 * `<name>.bak.<timestamp>` rather than overwritten — saves are never
 * byte-destroying.
 *
 * `category` is optional and trails the required arguments so every existing
 * call site keeps working; an entry saved without one lands in UNCATEGORIZED,
 * which is exactly where a library written before categories existed belongs.
 */
export function addEntry(lib, kind, name, code, category = UNCATEGORIZED) {
  const existing = findEntry(lib, kind, name);
  const kept = existing
    ? lib[kind].map((entry) =>
        entry.id === existing.id
          ? { ...entry, name: `${name}.bak.${Date.now().toString(36)}` }
          : entry,
      )
    : [...lib[kind]];
  return { ...lib, [kind]: [...kept, { id: newId(), name, code, category }] };
}

export function removeEntry(lib, kind, id) {
  return { ...lib, [kind]: lib[kind].filter((entry) => entry.id !== id) };
}

/** Moves one entry to a different category. */
export function setEntryCategory(lib, kind, id, category) {
  return {
    ...lib,
    [kind]: lib[kind].map((entry) => (entry.id === id ? { ...entry, category } : entry)),
  };
}

/**
 * Groups a kind's entries by category, in CATEGORIES order, with UNCATEGORIZED
 * last. Empty categories are dropped, and a category nobody declared (a
 * hand-edited import) is kept rather than silently swallowing its entries.
 */
export function groupByCategory(entries) {
  const buckets = new Map(CATEGORIES.map((c) => [c, []]));
  for (const entry of entries) {
    const key = entry.category ?? UNCATEGORIZED;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(entry);
  }
  // UNCATEGORIZED sorts last wherever it was inserted - it is the leftovers.
  const rows = [...buckets.entries()].filter(([, list]) => list.length > 0);
  return [
    ...rows.filter(([c]) => c !== UNCATEGORIZED),
    ...rows.filter(([c]) => c === UNCATEGORIZED),
  ];
}
