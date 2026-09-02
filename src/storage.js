import { addEntry, emptyLibrary, findEntry, KINDS } from './library.js';
import { SEED_SNIPPETS } from './seed-snippets.js';

const KEY = 'crt-strudel-library';
const SEEDED_KEY = 'crt-strudel-seeded';

function isLibrary(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    KINDS.every((kind) => Array.isArray(value[kind]))
  );
}

export function loadLibrary(storage) {
  const raw = storage.getItem(KEY);
  if (!raw) return emptyLibrary();
  try {
    const parsed = JSON.parse(raw);
    return isLibrary(parsed) ? parsed : emptyLibrary();
  } catch {
    return emptyLibrary();
  }
}

export function saveLibrary(storage, lib) {
  storage.setItem(KEY, JSON.stringify(lib));
}

export function exportJson(lib) {
  return JSON.stringify(lib, null, 2);
}

export function importJson(text) {
  const parsed = JSON.parse(text);
  if (!isLibrary(parsed)) throw new Error('Imported JSON is not a library');
  return parsed;
}

function loadSeededNames(storage) {
  try {
    const raw = storage.getItem(SEEDED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Merges the starter snippets (seed-snippets.js) into the library on load.
 *
 * A seed is applied AT MOST ONCE, ever, per browser: once its name has been
 * recorded under SEEDED_KEY, it is never added again - even if the user later
 * deletes it, and even if it's still absent. This is what stops a deleted
 * seed from being resurrected on the next load. An already-present entry
 * with the same name (e.g. the user's own edit) is left completely alone;
 * it is never overwritten and never displaces into a `.bak`.
 *
 * Never throws: a storage failure just means seeding is skipped for this
 * load, and the (possibly still-unseeded) library is returned so boot can
 * continue normally.
 */
export function seedLibrary(storage) {
  try {
    let lib = loadLibrary(storage);
    const seeded = loadSeededNames(storage);
    const seededSet = new Set(seeded);
    const nextSeeded = [...seeded];
    let libChanged = false;
    let seededChanged = false;

    for (const seed of SEED_SNIPPETS) {
      if (seededSet.has(seed.name)) continue;
      if (!findEntry(lib, 'snippets', seed.name)) {
        lib = addEntry(lib, 'snippets', seed.name, seed.code);
        libChanged = true;
      }
      nextSeeded.push(seed.name);
      seededChanged = true;
    }

    if (seededChanged) {
      try {
        storage.setItem(SEEDED_KEY, JSON.stringify(nextSeeded));
      } catch {
        // Storage unavailable/full - fall through without persisting.
      }
    }
    if (libChanged) {
      try {
        saveLibrary(storage, lib);
      } catch {
        // saveLibrary's own callers already surface a failure alert;
        // seeding just shouldn't crash boot if it can't persist.
      }
    }

    return lib;
  } catch {
    try {
      return loadLibrary(storage);
    } catch {
      return emptyLibrary();
    }
  }
}
