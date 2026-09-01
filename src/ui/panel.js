import { addEntry, removeEntry } from '../library.js';
import { exportJson, importJson, loadLibrary, saveLibrary } from '../storage.js';

export function createLibraryPanel(container, { onInsert, getSongCode, getSongName }) {
  let lib = loadLibrary(localStorage);
  let kind = 'snippets';
  let selectedId = null;

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
    for (const k of ['snippets', 'songs']) {
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
        onInsert(entry.code);
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

  refresh();

  return {
    refresh,
    getSelectedSnippetCode() {
      const entry = lib.snippets.find((e) => e.id === selectedId);
      return entry ? entry.code : null;
    },
  };
}
