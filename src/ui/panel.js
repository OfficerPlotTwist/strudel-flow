import { addEntry, removeEntry } from '../library.js';
import { exportJson, importJson, saveLibrary, seedLibrary } from '../storage.js';
import { getSoundEntries } from '../engine.js';

const TABS = ['snippets', 'songs', 'sounds'];

export function createLibraryPanel(container, { onInsert, getSongCode, getSongName }) {
  let lib = seedLibrary(localStorage);
  let kind = 'snippets';
  let selectedId = null;
  let soundFilter = '';

  function persist() {
    try {
      saveLibrary(localStorage, lib);
    } catch {
      window.alert('Save failed (storage may be full). Use EXPORT now to preserve your work.');
    }
    refresh();
  }

  function refresh() {
    container.innerHTML = '';

    const tabs = document.createElement('nav');
    tabs.className = 'lib-tabs';
    for (const k of TABS) {
      const button = document.createElement('button');
      button.textContent = k.toUpperCase();
      button.className = k === kind ? 'lib-tab viewed' : 'lib-tab';
      button.addEventListener('click', () => {
        kind = k;
        selectedId = null;
        refresh();
      });
      tabs.append(button);
    }

    if (kind === 'sounds') {
      container.append(tabs, renderSoundsTab());
      return;
    }

    const list = document.createElement('ul');
    list.className = 'lib-list';
    for (const entry of lib[kind]) {
      const item = document.createElement('li');
      item.className = entry.id === selectedId ? 'lib-item selected' : 'lib-item';

      const name = document.createElement('button');
      name.className = 'lib-name';
      name.textContent = entry.name;
      name.addEventListener('click', () => {
        selectedId = entry.id;
        onInsert(entry.code, kind, entry.name);
        refresh();
      });

      const promote = document.createElement('button');
      promote.className = 'lib-mini';
      promote.textContent = kind === 'songs' ? '→snip' : '';
      promote.hidden = kind !== 'songs';
      promote.title = 'Copy this song into Snippets';
      promote.addEventListener('click', () => {
        lib = addEntry(lib, 'snippets', entry.name, entry.code);
        persist();
      });

      const del = document.createElement('button');
      del.className = 'lib-mini';
      del.textContent = 'x';
      del.addEventListener('click', () => {
        if (!window.confirm(`Delete "${entry.name}"? This cannot be undone.`)) return;
        lib = removeEntry(lib, kind, entry.id);
        persist();
      });

      item.append(name, promote, del);
      list.append(item);
    }

    const actions = document.createElement('div');
    actions.className = 'lib-actions';

    const save = document.createElement('button');
    save.textContent = kind === 'songs' ? 'SAVE SONG' : 'SAVE AS SNIPPET';
    save.addEventListener('click', () => {
      const suggested = kind === 'songs' ? getSongName() : `${getSongName()}-block`;
      const name = window.prompt('Name:', suggested)?.trim();
      if (!name) return;
      lib = addEntry(lib, kind, name, getSongCode());
      persist();
    });

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'EXPORT';
    exportBtn.addEventListener('click', async () => {
      const json = exportJson(lib);
      try {
        await navigator.clipboard.writeText(json);
        exportBtn.textContent = 'COPIED';
        setTimeout(() => (exportBtn.textContent = 'EXPORT'), 1200);
      } catch {
        window.prompt('Copy your library JSON:', json);
      }
    });

    const importBtn = document.createElement('button');
    importBtn.textContent = 'IMPORT';
    importBtn.addEventListener('click', () => {
      const text = window.prompt('Paste library JSON:');
      if (!text) return;
      try {
        lib = importJson(text);
        persist();
      } catch (err) {
        window.alert(String(err.message));
      }
    });

    actions.append(save, exportBtn, importBtn);
    container.append(tabs, list, actions);
  }

  /**
   * The SOUNDS tab is a live, read-only view of the engine's sound registry -
   * it is NOT part of `lib`, is never persisted, and has no save/export/
   * import/delete controls (there is nothing user-owned here to act on).
   */
  function renderSoundsTab() {
    const wrap = document.createElement('div');
    wrap.className = 'lib-sounds';

    const filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.className = 'lib-sound-filter';
    filterInput.placeholder = 'filter sounds…';
    filterInput.value = soundFilter;
    filterInput.addEventListener('input', () => {
      soundFilter = filterInput.value;
      renderSoundList();
    });

    const list = document.createElement('ul');
    list.className = 'lib-list';

    function renderSoundList() {
      list.innerHTML = '';
      const entries = getSoundEntries();
      const needle = soundFilter.trim().toLowerCase();
      const filtered = needle ? entries.filter((e) => e.name.includes(needle)) : entries;

      if (entries.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'lib-sound-empty';
        empty.textContent = 'no sounds loaded yet (banks may still be loading, or the network is offline)';
        list.append(empty);
        return;
      }
      if (filtered.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'lib-sound-empty';
        empty.textContent = 'no sounds match filter';
        list.append(empty);
        return;
      }

      for (const entry of filtered) {
        const item = document.createElement('li');
        item.className = 'lib-item';

        const name = document.createElement('button');
        name.className = 'lib-name';
        name.textContent = entry.name;
        name.addEventListener('click', () => {
          onInsert(`s("${entry.name}")`, 'sounds', entry.name);
        });

        const type = document.createElement('span');
        type.className = 'lib-sound-type';
        type.textContent = entry.type;

        item.append(name, type);
        list.append(item);
      }
    }

    renderSoundList();
    wrap.append(filterInput, list);
    return wrap;
  }

  refresh();

  return {
    refresh,
    getSelectedSnippetCode() {
      const entry = lib.snippets.find((e) => e.id === selectedId);
      return entry ? entry.code : null;
    },
  };
}
