import { describe, expect, it } from 'vitest';
import { addEntry, emptyLibrary, findEntry, removeEntry } from '../src/library.js';
import { loadLibrary, saveLibrary, seedLibrary } from '../src/storage.js';
import { SEED_SNIPPETS } from '../src/seed-snippets.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
  };
}

const kindOf = (seed) => seed.kind ?? 'snippets';
const countOfKind = (kind) => SEED_SNIPPETS.filter((s) => kindOf(s) === kind).length;

describe('seedLibrary', () => {
  it('seeds all starter snippets into an empty library', () => {
    const storage = fakeStorage();
    const lib = seedLibrary(storage);
    for (const seed of SEED_SNIPPETS) {
      expect(findEntry(lib, kindOf(seed), seed.name).code).toBe(seed.code);
    }
    const stored = loadLibrary(storage);
    expect(stored.snippets).toHaveLength(countOfKind('snippets'));
    expect(stored.songs).toHaveLength(countOfKind('songs'));
  });

  it('does not duplicate seeds on a second run', () => {
    const storage = fakeStorage();
    seedLibrary(storage);
    const lib = seedLibrary(storage);
    for (const seed of SEED_SNIPPETS) {
      const matches = lib[kindOf(seed)].filter((e) => e.name === seed.name);
      expect(matches).toHaveLength(1);
    }
  });

  it('routes a `songs` seed into the songs library, not snippets', () => {
    const storage = fakeStorage();
    const lib = seedLibrary(storage);
    expect(findEntry(lib, 'songs', 'get_got')).toBeDefined();
    expect(findEntry(lib, 'snippets', 'get_got')).toBeUndefined();
  });

  it('never overwrites a user-edited snippet with the same name', () => {
    const storage = fakeStorage();
    let lib = addEntry(emptyLibrary(), 'snippets', 'piano_arp', 'my custom code');
    saveLibrary(storage, lib);

    lib = seedLibrary(storage);

    const entry = findEntry(lib, 'snippets', 'piano_arp');
    expect(entry.code).toBe('my custom code');
    // no .bak entry should have been created for the displaced seed
    expect(lib.snippets.some((e) => e.name.startsWith('piano_arp.bak.'))).toBe(false);
  });

  it('does not resurrect a seed the user deleted', () => {
    const storage = fakeStorage();
    let lib = seedLibrary(storage);
    const entry = findEntry(lib, 'snippets', 'dnb_chill');
    lib = removeEntry(lib, 'snippets', entry.id);
    saveLibrary(storage, lib);

    lib = seedLibrary(storage);

    expect(findEntry(lib, 'snippets', 'dnb_chill')).toBeUndefined();
  });

  it('does not write to storage when nothing changed', () => {
    const storage = fakeStorage();
    seedLibrary(storage);

    let setItemCalls = 0;
    const originalSetItem = storage.setItem;
    storage.setItem = (...args) => {
      setItemCalls += 1;
      return originalSetItem(...args);
    };

    seedLibrary(storage);

    expect(setItemCalls).toBe(0);
  });
});
