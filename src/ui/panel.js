import { addEntry, CATEGORIES, groupByCategory as groupEntries, removeEntry, UNCATEGORIZED } from '../library.js';
import { exportJson, importJson, migrateToDegrees, saveLibrary, seedLibrary } from '../storage.js';
import { getSoundEntries } from '../engine.js';
import { wrapIndex } from '../browse.js';
import { allFunctionNames, describe, groupByCategory, signatureOf } from '../explain.js';

const TABS = ['snippets', 'songs', 'sounds', 'funcs'];

export function createLibraryPanel(container, { onInsert, getSongCode, getSongName }) {
  // Seed first, migrate second: the seeds are already degree-based, so seeding
  // ahead of the migration leaves it nothing to do but the user's own older
  // entries. The other order would have it re-scan every starter snippet.
  seedLibrary(localStorage);
  let lib = migrateToDegrees(localStorage);
  let kind = 'snippets';
  let selectedId = null;
  let soundFilter = '';
  let funcFilter = '';
  let openFunc = null;
  // Category sections the user has collapsed. Open is the default: a closed-by-
  // default list of twelve headings hides every function behind a second click.
  const closedCategories = new Set();
  // Where the control surface is looking. Held as MODEL keys rather than DOM
  // positions, because the list is rebuilt from scratch on every refresh and
  // an index into the old DOM would point at whatever moved into that slot.
  let browseKey = null;
  let browseCategory = null;

  function persist() {
    try {
      saveLibrary(localStorage, lib);
    } catch {
      window.alert('Save failed (storage may be full). Use EXPORT now to preserve your work.');
    }
    refresh();
  }

  /**
   * The one path into the library. Both the SAVE buttons and the rip-to-library
   * hotkey go through here, so a ripped block is stored exactly the way a
   * hand-saved one is - same naming prompt, same persistence, same failure
   * alert. Returns the name it saved under, or null if the prompt was
   * dismissed.
   */
  function saveEntry(target, suggested, code) {
    const name = window.prompt('Name:', suggested)?.trim();
    if (!name) return null;
    // Songs have no block role - they ARE the arrangement - so only a snippet
    // is worth asking about. An empty or unrecognised answer means "leave it
    // uncategorised" rather than "cancel the save": having typed the name
    // already, losing the snippet to a typo here would be the wrong trade.
    let category = UNCATEGORIZED;
    if (target === 'snippets') {
      const answer = window
        .prompt(`Category (${CATEGORIES.join(' / ')}), or blank:`, '')
        ?.trim()
        .toLowerCase();
      if (answer && CATEGORIES.includes(answer)) category = answer;
    }
    lib = addEntry(lib, target, name, code, category);
    persist();
    return name;
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

    if (kind === 'funcs') {
      container.append(tabs, renderFuncsTab());
      return;
    }

    const list = document.createElement('ul');
    list.className = 'lib-list';

    const renderEntry = (entry) => {
      const item = document.createElement('li');
      item.className = entry.id === selectedId ? 'lib-item selected' : 'lib-item';
      item.dataset.browseKey = entry.id;
      if (entry.id === browseKey) item.classList.add('browse-cursor');

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
        // A promoted song keeps no category: it was never one of the four
        // block roles, and guessing one would be worse than leaving it in
        // `other` where the user can see it and move it.
        lib = addEntry(lib, 'snippets', entry.name, entry.code, UNCATEGORIZED);
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
    };

    // Songs are whole arrangements and have no block role, so they stay a flat
    // list; only snippets are grouped. Grouping a list of four songs under one
    // heading is pure overhead.
    if (kind === 'songs') {
      for (const entry of lib[kind]) renderEntry(entry);
    } else {
      for (const [category, group] of groupEntries(lib[kind])) {
        const heading = document.createElement('li');
        heading.className = 'lib-func-cat';
        const collapsed = closedCategories.has(`snippets:${category}`);
        heading.classList.toggle('collapsed', collapsed);

        const toggle = document.createElement('button');
        toggle.className = 'lib-func-cat-btn';
        toggle.textContent = `${collapsed ? '▸' : '▾'} ${category}`;
        toggle.title = collapsed ? `show ${group.length} ${category} snippets` : `hide ${category}`;
        toggle.addEventListener('click', () => {
          const key = `snippets:${category}`;
          if (closedCategories.has(key)) closedCategories.delete(key);
          else closedCategories.add(key);
          refresh();
        });

        const count = document.createElement('span');
        count.className = 'lib-func-cat-n';
        count.textContent = String(group.length);

        heading.append(toggle, count);
        list.append(heading);
        if (collapsed) continue;
        for (const entry of group) renderEntry(entry);
      }
    }

    const actions = document.createElement('div');
    actions.className = 'lib-actions';

    const save = document.createElement('button');
    save.textContent = kind === 'songs' ? 'SAVE SONG' : 'SAVE AS SNIPPET';
    save.addEventListener('click', () => {
      const suggested = kind === 'songs' ? getSongName() : `${getSongName()}-block`;
      saveEntry(kind, suggested, getSongCode());
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
        item.dataset.browseKey = entry.name;
        if (entry.name === browseKey) item.classList.add('browse-cursor');

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

  /**
   * The FUNCS tab is the same shape as SOUNDS - a read-only, filterable index
   * with nothing user-owned to save or delete. Its contents come from
   * src/strudel-docs.json, extracted from the installed @strudel packages'
   * own JSDoc by scripts/build-docs.mjs.
   *
   * Names and descriptions are both searchable, because the useful question
   * here is usually "what is the one that does X", not "spell `sometimesBy`".
   */
  function renderFuncsTab() {
    const wrap = document.createElement('div');
    wrap.className = 'lib-funcs';

    const filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.className = 'lib-sound-filter';
    filterInput.placeholder = 'search functions…';
    filterInput.value = funcFilter;
    filterInput.addEventListener('input', () => {
      funcFilter = filterInput.value;
      renderFuncList();
    });

    const list = document.createElement('ul');
    list.className = 'lib-list';

    function renderFuncList() {
      list.innerHTML = '';
      const needle = funcFilter.trim().toLowerCase();
      const entries = allFunctionNames()
        .map((name) => describe(name))
        .filter(
          (info) =>
            !needle ||
            info.name.toLowerCase().includes(needle) ||
            info.description.toLowerCase().includes(needle),
        );

      if (entries.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'lib-sound-empty';
        empty.textContent = 'no functions match filter';
        list.append(empty);
        return;
      }

      // One <li> per function, but emitted under a category heading. The
      // heading is a real row rather than a CSS ::before so it can be clicked
      // to collapse its section - twelve headings is a table of contents, and
      // a table of contents you cannot fold is just a longer list.
      const searching = needle.length > 0;
      const renderOne = (info) => {
        const item = document.createElement('li');
        item.className = info.name === openFunc ? 'lib-item lib-func selected' : 'lib-item lib-func';
        item.dataset.browseKey = info.name;
        if (info.name === browseKey) item.classList.add('browse-cursor');

        const name = document.createElement('button');
        name.className = 'lib-name';
        name.textContent = info.name;
        name.title = info.description;
        name.addEventListener('click', () => {
          openFunc = openFunc === info.name ? null : info.name;
          renderFuncList();
        });

        const insert = document.createElement('button');
        insert.className = 'lib-mini';
        insert.textContent = '→';
        insert.title = `Insert .${info.name}()`;
        insert.addEventListener('click', () => onInsert(`.${info.name}()`, 'funcs', info.name));

        item.append(name, insert);
        list.append(item);

        if (info.name !== openFunc) return;

        const detail = document.createElement('li');
        detail.className = 'lib-func-detail';
        const sig = document.createElement('div');
        sig.className = 'lib-func-sig';
        sig.textContent = signatureOf(info);
        const desc = document.createElement('p');
        desc.textContent = info.description;
        detail.append(sig);
        if (info.isAlias) {
          const alias = document.createElement('div');
          alias.className = 'lib-func-alias';
          alias.textContent = `alias of ${info.canonical}`;
          detail.append(alias);
        }
        detail.append(desc);
        if (info.example) {
          const example = document.createElement('pre');
          example.textContent = info.example;
          detail.append(example);
        }
        list.append(detail);
      };

      for (const [category, group] of groupByCategory(entries)) {
        const heading = document.createElement('li');
        heading.className = 'lib-func-cat';
        // While searching, every section is forced open: a hit hidden inside a
        // collapsed section reads as "no results", which is worse than a long
        // list. The user's own collapse state is remembered, not discarded.
        const collapsed = !searching && closedCategories.has(category);
        heading.classList.toggle('collapsed', collapsed);

        const toggle = document.createElement('button');
        toggle.className = 'lib-func-cat-btn';
        toggle.textContent = `${collapsed ? '▸' : '▾'} ${category}`;
        toggle.title = searching
          ? 'sections stay open while searching'
          : collapsed
            ? `show ${group.length} ${category} functions`
            : `hide ${category}`;
        const count = document.createElement('span');
        count.className = 'lib-func-cat-n';
        count.textContent = String(group.length);
        toggle.addEventListener('click', () => {
          if (closedCategories.has(category)) closedCategories.delete(category);
          else closedCategories.add(category);
          renderFuncList();
        });

        heading.append(toggle, count);
        list.append(heading);
        if (collapsed) continue;
        for (const info of group) renderOne(info);
      }
    }

    renderFuncList();
    wrap.append(filterInput, list);
    return wrap;
  }

  refresh();

  // ---- browsing from the control surface ---------------------------------
  //
  // These read the RENDERED list rather than the four tabs' very different
  // models. That is deliberate: snippets, songs, sounds and functions each
  // group and filter their entries differently, and the one thing they agree
  // on is what ends up on screen - which is also the thing the performer is
  // looking at while turning the knob. Every row carries its model key in a
  // data attribute, so what gets stored is still a key, never a DOM position.

  /** The rendered list as `[{ category, items }]`, headings included. */
  function sections() {
    const rows = [...container.querySelectorAll('.lib-list > li')];
    const out = [];
    for (const row of rows) {
      const heading = row.querySelector('.lib-func-cat-btn, .lib-cat-btn');
      if (heading) {
        out.push({
          category: heading.textContent.replace(/^[^a-z]*/i, '').trim(),
          // The heading row, not the button inside it - that is the thing to
          // put against the top edge when this category is stepped to.
          row,
          items: [],
        });
      } else if (row.dataset.browseKey !== undefined) {
        // A list with no headings at all (SOUNDS) is one nameless section.
        if (out.length === 0) out.push({ category: null, row: null, items: [] });
        out[out.length - 1].items.push(row);
      }
    }
    return out.filter((section) => section.items.length > 0);
  }

  function currentSectionIndex(list) {
    const byCategory = list.findIndex((s) => s.category === browseCategory);
    if (byCategory !== -1) return byCategory;
    // Fall back to whichever section holds the browsed row, so moving the
    // category cursor after clicking something starts from what is on screen.
    const byKey = list.findIndex((s) => s.items.some((i) => i.dataset.browseKey === browseKey));
    return byKey === -1 ? 0 : byKey;
  }

  function show(item, { scroll = true } = {}) {
    browseKey = item.dataset.browseKey;
    item.classList.add('browse-cursor');
    for (const other of container.querySelectorAll('.browse-cursor')) {
      if (other !== item) other.classList.remove('browse-cursor');
    }
    if (scroll) item.scrollIntoView({ block: 'nearest' });
    return item.querySelector('.lib-name')?.textContent ?? browseKey;
  }

  return {
    refresh,
    saveEntry,
    /**
     * Show a named tab, without moving the browse cursor if it is already
     * there.
     *
     * Used when the function under the block cursor decides which list can
     * answer it. Preserving the cursor matters: scrolling the block's
     * functions past two sample calls in a row must not keep resetting the
     * sound you had picked out.
     */
    showTab(next) {
      if (!TABS.includes(next) || next === kind) return kind;
      kind = next;
      browseKey = null;
      browseCategory = null;
      refresh();
      return kind;
    },
    /** Which tab is showing. */
    getTab: () => kind,
    /** Cycle which library tab is showing. Driven by nudge - / nudge +. */
    moveTab(delta) {
      kind = TABS[wrapIndex(TABS.indexOf(kind), delta, TABS.length)];
      browseKey = null;
      browseCategory = null;
      refresh();
      return kind;
    },
    /** Step to another category within the current tab. */
    moveCategory(delta) {
      const list = sections();
      if (list.length === 0) return null;
      const next = list[wrapIndex(currentSectionIndex(list), delta, list.length)];
      browseCategory = next.category;
      // The cursor lands on the first entry, but the HEADING is what goes to
      // the top edge: stepping to a category should show the whole category,
      // and 'nearest' on its first row leaves the heading off-screen above
      // whenever you arrive from below.
      show(next.items[0], { scroll: false });
      (next.row ?? next.items[0]).scrollIntoView({ block: 'start' });
      return next.category ?? kind;
    },
    /** Step to another entry inside the category the cursor is in. */
    moveItem(delta) {
      const list = sections();
      if (list.length === 0) return null;
      const section = list[currentSectionIndex(list)];
      const at = section.items.findIndex((i) => i.dataset.browseKey === browseKey);
      // Highlight only - clicking a row INSERTS it, and a scroll wheel that
      // pasted code into the song on the way past would be unusable.
      return show(section.items[wrapIndex(at === -1 ? 0 : at, at === -1 ? 0 : delta, section.items.length)]);
    },
    /**
     * The sound under the browse cursor, or null when the SOUNDS tab is not
     * the one showing. Only that tab's rows are keyed by sound name; a snippet
     * id would name no sound and the audition would sit silent.
     */
    getHighlightedSound() {
      return kind === 'sounds' ? browseKey : null;
    },
    /**
     * Whatever the browse cursor is on, as something that can be put in a
     * song - `{ kind, name, code }` - or null.
     *
     * One getter across all four tabs, because the block builder does not care
     * which list a pick came from, only what it is worth inserting. The two
     * translations happen here rather than at the call site: a SOUNDS row is a
     * name and becomes `s("name")`, and a FUNCS row is a method and becomes
     * the fragment `.name()`, which is exactly what chains onto a block.
     */
    getHighlighted() {
      if (!browseKey) return null;
      if (kind === 'sounds') {
        return { kind, name: browseKey, code: `s("${browseKey}")` };
      }
      if (kind === 'funcs') {
        return { kind, name: browseKey, code: `.${browseKey}()` };
      }
      const entry = lib[kind]?.find((e) => e.id === browseKey);
      return entry ? { kind, name: entry.name, code: entry.code } : null;
    },
    getSelectedSnippetCode() {
      // The browse cursor wins when it is on something: it is the more recent
      // statement of intent, and it is the row currently outlined on screen.
      const entry =
        lib.snippets.find((e) => e.id === browseKey) ??
        lib.snippets.find((e) => e.id === selectedId);
      return entry ? entry.code : null;
    },
  };
}
