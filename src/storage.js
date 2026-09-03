import { addEntry, emptyLibrary, findEntry, KINDS, UNCATEGORIZED } from './library.js';
import { SEED_SNIPPETS } from './seed-snippets.js';
import { toDegrees } from './degrees.js';

const KEY = 'crt-strudel-library';
const SEEDED_KEY = 'crt-strudel-seeded';
const DEGREES_KEY = 'crt-strudel-degrees-migrated';
const PRE_DEGREES_KEY = 'crt-strudel-library.pre-degrees';

function isLibrary(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    KINDS.every((kind) => Array.isArray(value[kind]))
  );
}

/**
 * Backfills `category` on entries saved before categories existed.
 *
 * Done on read rather than as a one-off upgrade step: there is no version
 * number in the stored shape to key an upgrade off, and a library can arrive
 * from IMPORT as easily as from localStorage. Reading is the one place every
 * library passes through, so normalising here means the rest of the app can
 * assume the field is present.
 *
 * Non-destructive: it only fills a missing field, never reassigns one the
 * user set.
 */
function withCategories(lib) {
  let changed = false;
  const out = { ...lib };
  for (const kind of KINDS) {
    out[kind] = lib[kind].map((entry) => {
      if (typeof entry.category === 'string') return entry;
      changed = true;
      return { ...entry, category: UNCATEGORIZED };
    });
  }
  return changed ? out : lib;
}

export function loadLibrary(storage) {
  const raw = storage.getItem(KEY);
  if (!raw) return emptyLibrary();
  try {
    const parsed = JSON.parse(raw);
    return isLibrary(parsed) ? withCategories(parsed) : emptyLibrary();
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
  // An export from an older build, or from someone else's, has no categories.
  return withCategories(parsed);
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
      // A seed lands in `snippets` unless it declares otherwise; a whole song
      // (a full arrangement meant to be opened as a tab, not spliced into one)
      // sets `kind: 'songs'`.
      const kind = KINDS.includes(seed.kind) ? seed.kind : 'snippets';
      if (!findEntry(lib, kind, seed.name)) {
        lib = addEntry(lib, kind, seed.name, seed.code, seed.category);
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

/**
 * Rewrites already-saved snippets from `note("c3 eb3")` into the degree form
 * `n("0 2").scale("c3:minor")` the rest of the app now speaks.
 *
 * Runs ONCE per browser, guarded by DEGREES_KEY. The marker is written even
 * when nothing was converted, because "already all degrees" is the common case
 * and re-scanning every entry on every boot would cost the same as the real
 * migration forever.
 *
 * Before the first changed entry is persisted, the ENTIRE pre-migration library
 * is copied to PRE_DEGREES_KEY verbatim. It is stored as library JSON - the
 * exact shape IMPORT accepts - so a user who dislikes the rewrite can recover
 * their old snippets by pasting that value into the panel's IMPORT box. The
 * backup is written at most once and an existing one is never clobbered: a
 * second migration (say, after a manual marker reset) must not overwrite the
 * only copy of the original with an already-migrated one.
 *
 * Never throws, for the same reason seedLibrary doesn't: this sits on the boot
 * path, and a full or unavailable storage should cost the user a migration,
 * not the app.
 */
export function migrateToDegrees(storage) {
  try {
    if (storage.getItem(DEGREES_KEY)) return loadLibrary(storage);

    const lib = loadLibrary(storage);
    let changed = false;
    const out = { ...lib };
    for (const kind of KINDS) {
      out[kind] = lib[kind].map((entry) => {
        const result = toDegrees(entry.code);
        if (!result.changed) return entry;
        changed = true;
        // id/name/category are the user's; only the code is rewritten.
        return { ...entry, code: result.code };
      });
    }

    let persisted = true;
    if (changed) {
      try {
        if (!storage.getItem(PRE_DEGREES_KEY)) {
          storage.setItem(PRE_DEGREES_KEY, JSON.stringify(lib));
        }
        saveLibrary(storage, out);
      } catch {
        // Storage unavailable/full. The session keeps the in-memory migration,
        // but nothing reached disk - so the marker must NOT be written. Marking
        // a migration done that never persisted would strand the user's entries
        // in the old form permanently, with no backup, and nothing to retry it.
        persisted = false;
      }
    }

    if (persisted) {
      try {
        storage.setItem(DEGREES_KEY, '1');
      } catch {
        // Unpersisted marker just means another scan next load; harmless.
      }
    }

    return changed ? out : lib;
  } catch {
    try {
      return loadLibrary(storage);
    } catch {
      return emptyLibrary();
    }
  }
}
