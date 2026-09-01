import { emptyLibrary, KINDS } from './library.js';

const KEY = 'crt-strudel-library';

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
