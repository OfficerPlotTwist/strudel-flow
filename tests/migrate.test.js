import { describe, expect, it } from 'vitest';
import { addEntry, emptyLibrary, findEntry } from '../src/library.js';
import { loadLibrary, migrateToDegrees, saveLibrary } from '../src/storage.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
  };
}

const MARKER = 'crt-strudel-degrees-migrated';
const BACKUP = 'crt-strudel-library.pre-degrees';

const OLD = 'note("c3 eb3 g3").sound("piano")';
const NEW = 'n("0 2 4").scale("c3:minor").sound("piano")';

function storedWith(entries) {
  const storage = fakeStorage();
  let lib = emptyLibrary();
  for (const [kind, name, code, category] of entries) {
    lib = addEntry(lib, kind, name, code, category);
  }
  saveLibrary(storage, lib);
  return { storage, lib };
}

describe('migrateToDegrees', () => {
  it('converts a stored note() entry to degrees', () => {
    const { storage } = storedWith([['snippets', 'old_arp', OLD]]);
    const lib = migrateToDegrees(storage);
    expect(findEntry(lib, 'snippets', 'old_arp').code).toBe(NEW);
    // and it is persisted, not just returned
    expect(findEntry(loadLibrary(storage), 'snippets', 'old_arp').code).toBe(NEW);
  });

  it('leaves an already-degree entry alone', () => {
    const { storage } = storedWith([['snippets', 'new_arp', NEW]]);
    const lib = migrateToDegrees(storage);
    expect(findEntry(lib, 'snippets', 'new_arp').code).toBe(NEW);
    expect(storage.getItem(BACKUP)).toBeNull();
  });

  it('preserves id, name and category', () => {
    const { storage, lib: before } = storedWith([['snippets', 'old_arp', OLD, 'bass']]);
    const original = findEntry(before, 'snippets', 'old_arp');
    const entry = findEntry(migrateToDegrees(storage), 'snippets', 'old_arp');
    expect(entry.id).toBe(original.id);
    expect(entry.name).toBe('old_arp');
    expect(entry.category).toBe('bass');
  });

  it('migrates entries in both snippets and songs', () => {
    const { storage } = storedWith([
      ['snippets', 'old_arp', OLD],
      ['songs', 'old_song', OLD],
    ]);
    const lib = migrateToDegrees(storage);
    expect(findEntry(lib, 'snippets', 'old_arp').code).toBe(NEW);
    expect(findEntry(lib, 'songs', 'old_song').code).toBe(NEW);
  });

  it('writes the pre-migration library to the backup key as valid library JSON', () => {
    const { storage } = storedWith([['snippets', 'old_arp', OLD]]);
    migrateToDegrees(storage);
    const backup = JSON.parse(storage.getItem(BACKUP));
    expect(findEntry(backup, 'snippets', 'old_arp').code).toBe(OLD);
    expect(Array.isArray(backup.songs)).toBe(true);
  });

  it('never clobbers an existing backup', () => {
    const { storage } = storedWith([['snippets', 'old_arp', OLD]]);
    storage.setItem(BACKUP, '{"mine":true}');
    migrateToDegrees(storage);
    expect(storage.getItem(BACKUP)).toBe('{"mine":true}');
  });

  it('sets the marker even when nothing changed', () => {
    const { storage } = storedWith([['snippets', 'new_arp', NEW]]);
    migrateToDegrees(storage);
    expect(storage.getItem(MARKER)).toBeTruthy();
  });

  it('does not write to storage on a second run', () => {
    const { storage } = storedWith([['snippets', 'old_arp', OLD]]);
    migrateToDegrees(storage);

    let setItemCalls = 0;
    const originalSetItem = storage.setItem;
    storage.setItem = (...args) => {
      setItemCalls += 1;
      return originalSetItem(...args);
    };

    const lib = migrateToDegrees(storage);

    expect(setItemCalls).toBe(0);
    expect(findEntry(lib, 'snippets', 'old_arp').code).toBe(NEW);
  });

  it('does not throw when storage refuses to write', () => {
    const { storage } = storedWith([['snippets', 'old_arp', OLD]]);
    storage.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    let lib;
    expect(() => {
      lib = migrateToDegrees(storage);
    }).not.toThrow();
    // the migration still happened in memory for this session
    expect(findEntry(lib, 'snippets', 'old_arp').code).toBe(NEW);
  });

  it('does not mark itself done when the write failed, so it retries', () => {
    const { storage } = storedWith([['snippets', 'old_arp', OLD]]);
    const working = storage.setItem;
    // Quota is exhausted by the LIBRARY write, not by the one-byte marker -
    // that asymmetry is the whole failure: the big write fails, the small one
    // would still succeed, and the migration must not call itself done.
    storage.setItem = (k, v) => {
      if (k !== MARKER) throw new Error('QuotaExceeded');
      return working(k, v);
    };

    migrateToDegrees(storage);

    // Marking a migration done that never reached disk would strand the entry
    // in the old form forever, with no backup and nothing left to retry it.
    expect(storage.getItem(MARKER)).toBeNull();
    expect(storage.getItem(BACKUP)).toBeNull();
    expect(findEntry(loadLibrary(storage), 'snippets', 'old_arp').code).toBe(OLD);

    storage.setItem = working;
    const lib = migrateToDegrees(storage);

    expect(findEntry(lib, 'snippets', 'old_arp').code).toBe(NEW);
    expect(findEntry(loadLibrary(storage), 'snippets', 'old_arp').code).toBe(NEW);
    expect(storage.getItem(MARKER)).toBe('1');
    // the backup captures the ORIGINAL, not the already-migrated, code
    expect(JSON.parse(storage.getItem(BACKUP)).snippets[0].code).toBe(OLD);
  });
});
