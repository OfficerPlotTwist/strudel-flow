import { describe, expect, it } from 'vitest';
import {
  addEntry,
  CATEGORIES,
  emptyLibrary,
  groupByCategory,
  setEntryCategory,
  UNCATEGORIZED,
} from '../src/library.js';
import { importJson, loadLibrary, saveLibrary } from '../src/storage.js';
import { SEED_SNIPPETS } from '../src/seed-snippets.js';
import { SEED_BLOCKS } from '../src/seed-blocks.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
  };
}

describe('category on library entries', () => {
  it('defaults to uncategorised so every existing call site still works', () => {
    const lib = addEntry(emptyLibrary(), 'snippets', 'kick', 's("bd")');
    expect(lib.snippets[0].category).toBe(UNCATEGORIZED);
  });

  it('stores the category it was given', () => {
    const lib = addEntry(emptyLibrary(), 'snippets', 'kick', 's("bd")', 'beat');
    expect(lib.snippets[0].category).toBe('beat');
  });

  it('moves an entry between categories without touching the rest', () => {
    let lib = addEntry(emptyLibrary(), 'snippets', 'a', 'x', 'beat');
    lib = addEntry(lib, 'snippets', 'b', 'y', 'pads');
    const id = lib.snippets[0].id;
    const next = setEntryCategory(lib, 'snippets', id, 'synths');
    expect(next.snippets[0].category).toBe('synths');
    expect(next.snippets[1].category).toBe('pads');
  });
});

describe('groupByCategory', () => {
  const entries = [
    { name: 'p', category: 'pads' },
    { name: 'b', category: 'beat' },
    { name: 'u', category: UNCATEGORIZED },
    { name: 'b2', category: 'beat' },
  ];

  it('returns declared categories in CATEGORIES order', () => {
    const order = groupByCategory(entries).map(([c]) => c);
    expect(order.slice(0, 2)).toEqual(['beat', 'pads']);
  });

  it('always puts uncategorised last - it is the leftovers', () => {
    const order = groupByCategory(entries).map(([c]) => c);
    expect(order[order.length - 1]).toBe(UNCATEGORIZED);
  });

  it('drops empty categories', () => {
    const order = groupByCategory(entries).map(([c]) => c);
    expect(order).not.toContain('melodies');
  });

  it('keeps an unknown category rather than swallowing its entries', () => {
    const groups = groupByCategory([{ name: 'x', category: 'invented' }]);
    expect(groups.map(([c]) => c)).toContain('invented');
  });

  it('treats a missing category as uncategorised', () => {
    const groups = groupByCategory([{ name: 'x' }]);
    expect(groups).toEqual([[UNCATEGORIZED, [{ name: 'x' }]]]);
  });

  it('accounts for every entry exactly once', () => {
    const flat = groupByCategory(entries).flatMap(([, list]) => list);
    expect(flat).toHaveLength(entries.length);
  });
});

describe('migration of libraries saved before categories existed', () => {
  const legacy = {
    snippets: [{ id: '1', name: 'old', code: 's("bd")' }],
    songs: [{ id: '2', name: 'song', code: 's("sd")' }],
  };

  it('backfills a missing category on read instead of dropping the entry', () => {
    const storage = fakeStorage();
    storage.setItem('crt-strudel-library', JSON.stringify(legacy));
    const lib = loadLibrary(storage);
    expect(lib.snippets[0].category).toBe(UNCATEGORIZED);
    expect(lib.songs[0].category).toBe(UNCATEGORIZED);
    expect(lib.snippets[0].code).toBe('s("bd")');
  });

  it('never reassigns a category the user already set', () => {
    const storage = fakeStorage();
    saveLibrary(storage, {
      snippets: [{ id: '1', name: 'mine', code: 'x', category: 'melodies' }],
      songs: [],
    });
    expect(loadLibrary(storage).snippets[0].category).toBe('melodies');
  });

  it('backfills an import from an older build too', () => {
    expect(importJson(JSON.stringify(legacy)).snippets[0].category).toBe(UNCATEGORIZED);
  });
});

describe('the seeded collection', () => {
  it('ships a substantial set in each of the four categories', () => {
    for (const category of CATEGORIES) {
      const inCategory = SEED_BLOCKS.filter((s) => s.category === category);
      expect(inCategory.length, `category ${category}`).toBeGreaterThanOrEqual(10);
    }
  });

  it('only uses declared categories', () => {
    const unknown = [...new Set(SEED_BLOCKS.map((s) => s.category))].filter(
      (c) => !CATEGORIES.includes(c),
    );
    expect(unknown).toEqual([]);
  });

  it('has no duplicate names, which would trigger .bak renames on seed', () => {
    const names = SEED_SNIPPETS.map((s) => s.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it('never sets tempo - a block must not re-tempo the song it is dropped into', () => {
    const offenders = SEED_BLOCKS.filter((s) => /\bsetcp[ms]\s*\(/.test(s.code));
    expect(offenders.map((s) => s.name)).toEqual([]);
  });

  it('is one pattern per block, so blocks compose side by side', () => {
    const offenders = SEED_BLOCKS.filter((s) => (s.code.match(/\$:/g) ?? []).length !== 1);
    expect(offenders.map((s) => s.name)).toEqual([]);
  });
});
