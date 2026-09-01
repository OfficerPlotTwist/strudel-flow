export const KINDS = ['snippets', 'songs'];

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
 */
export function addEntry(lib, kind, name, code) {
  const existing = findEntry(lib, kind, name);
  const kept = existing
    ? lib[kind].map((entry) =>
        entry.id === existing.id
          ? { ...entry, name: `${name}.bak.${Date.now().toString(36)}` }
          : entry,
      )
    : [...lib[kind]];
  return { ...lib, [kind]: [...kept, { id: newId(), name, code }] };
}

export function removeEntry(lib, kind, id) {
  return { ...lib, [kind]: lib[kind].filter((entry) => entry.id !== id) };
}
