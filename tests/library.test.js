import { describe, expect, it } from 'vitest';
import { addEntry, emptyLibrary, findEntry, removeEntry } from '../src/library.js';
import { exportJson, importJson, loadLibrary, saveLibrary } from '../src/storage.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
  };
}

describe('library model', () => {
  it('starts empty in both kinds', () => {
    expect(emptyLibrary()).toEqual({ snippets: [], songs: [] });
  });

  it('adds an entry with a generated id', () => {
    const lib = addEntry(emptyLibrary(), 'snippets', 'kick', 's("bd")');
    expect(lib.snippets).toHaveLength(1);
    expect(lib.snippets[0].name).toBe('kick');
    expect(lib.snippets[0].code).toBe('s("bd")');
    expect(lib.snippets[0].id).toMatch(/\S/);
  });

  it('does not mutate the input library', () => {
    const before = emptyLibrary();
    addEntry(before, 'songs', 'a', 'x');
    expect(before.songs).toHaveLength(0);
  });

  it('keeps kinds independent', () => {
    const lib = addEntry(emptyLibrary(), 'songs', 'set1', 'x');
    expect(lib.snippets).toHaveLength(0);
    expect(lib.songs).toHaveLength(1);
  });

  it('renames the old entry to a backup instead of destroying it', () => {
    let lib = addEntry(emptyLibrary(), 'songs', 'set1', 'old');
    lib = addEntry(lib, 'songs', 'set1', 'new');
    expect(findEntry(lib, 'songs', 'set1').code).toBe('new');
    const backup = lib.songs.find((e) => e.name.startsWith('set1.bak.'));
    expect(backup.code).toBe('old');
  });

  it('removes an entry by id', () => {
    const lib = addEntry(emptyLibrary(), 'snippets', 'kick', 's("bd")');
    expect(removeEntry(lib, 'snippets', lib.snippets[0].id).snippets).toHaveLength(0);
  });
});

describe('storage', () => {
  it('returns an empty library when nothing is stored', () => {
    expect(loadLibrary(fakeStorage())).toEqual(emptyLibrary());
  });

  it('round-trips through storage', () => {
    const storage = fakeStorage();
    const lib = addEntry(emptyLibrary(), 'snippets', 'kick', 's("bd")');
    saveLibrary(storage, lib);
    expect(loadLibrary(storage)).toEqual(lib);
  });

  it('falls back to an empty library on corrupt data', () => {
    const storage = fakeStorage();
    storage.setItem('crt-strudel-library', '{not json');
    expect(loadLibrary(storage)).toEqual(emptyLibrary());
  });

  it('round-trips through export and import', () => {
    const lib = addEntry(emptyLibrary(), 'songs', 'set1', 'x');
    expect(importJson(exportJson(lib))).toEqual(lib);
  });

  it('rejects imported JSON that is not a library', () => {
    expect(() => importJson('[1,2,3]')).toThrow(/not a library/i);
  });
});
