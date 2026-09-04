import { javascript } from '@codemirror/lang-javascript';
import { EditorSelection, EditorState, Prec } from '@codemirror/state';
import { EditorView, drawSelection, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { highlightExtension, highlightMiniLocations, updateMiniLocations } from '@strudel/codemirror';
import { findBlock, findBlocksInRange, listBlocks, toggleBlocksComment } from './blocks.js';
import { crtTheme } from './crt-theme.js';
import { ensureBus } from './bus.js';
import { functionColorExtension, functionColorTheme } from './ui/function-colors.js';
import { cycleBadgeExtension, setCycleCount } from './ui/cycle-badge.js';
import { argMapExtension, setArgMap } from './ui/arg-map.js';
import { cursorBlockExtension, setCursorBlock } from './ui/cursor-block.js';
import { browsedFnExtension, setBrowsedFn } from './ui/browsed-fn.js';

export function createEditorPane(container) {
  const tabs = new Map(); // id -> { id, name, view, wrapper, bar }
  const bar = document.createElement('nav');
  bar.className = 'tab-bar';
  const host = document.createElement('div');
  host.className = 'tab-host';
  // A mirror of the song bar along the bottom edge. It holds the same kind of
  // tab and behaves identically - the only difference is which strip renders
  // it. It exists so ripped-out material has somewhere to land that is
  // visibly NOT part of the set you are playing from.
  const bottomBar = document.createElement('nav');
  bottomBar.className = 'tab-bar tab-bar-bottom';
  container.append(bar, host, bottomBar);

  let viewedId = null;
  let activeId = null;
  let editListener = () => {};
  let cursorListener = () => {};
  let viewListener = () => {};
  let closeListener = () => {};
  let counter = 0;

  function renderBar() {
    for (const [element, which] of [
      [bar, 'top'],
      [bottomBar, 'bottom'],
    ]) {
      element.innerHTML = '';
      for (const tab of tabs.values()) {
        if (tab.bar !== which) continue;
        const button = document.createElement('button');
        button.textContent = tab.name;
        button.className = 'tab';
        if (tab.id === viewedId) button.classList.add('viewed');
        if (tab.id === activeId) button.classList.add('active');
        button.addEventListener('click', () => viewTab(tab.id));
        element.append(button);
      }

      const addButton = document.createElement('button');
      addButton.textContent = '+';
      addButton.className = 'tab tab-add';
      addButton.title = which === 'top' ? 'New tab' : 'New holding tab';
      addButton.addEventListener('click', () => {
        const name = window.prompt('Name:', `song-${tabs.size + 1}`)?.trim();
        if (!name) return;
        viewTab(addTab(name, '', { bar: which }));
      });
      element.append(addButton);
    }
    // The bottom strip is only worth the vertical space once something is
    // down there; until then it is just a stray `+` under the editor.
    bottomBar.hidden = ![...tabs.values()].some((t) => t.bar === 'bottom');
  }

  function addTab(name, code = '', { bar: which = 'top', first = false, bus = true } = {}) {
    counter += 1;
    // Every song carries a reverb bus, added here rather than by each caller:
    // there is one reverb per orbit, so there has to be exactly one place that
    // says how big it is. The bottom bar is the exception - ripped material is
    // parked there, not performed, and gets its bus when it joins a song.
    const source = bus && which === 'top' ? ensureBus(code) : code;
    const id = `tab-${counter}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'tab-view';
    wrapper.hidden = true;
    host.append(wrapper);

    const view = new EditorView({
      parent: wrapper,
      state: EditorState.create({
        doc: source,
        extensions: [
          lineNumbers(),
          // Off by default, and without it CodeMirror silently keeps only the
          // main range - so pinning two blocks from the control surface would
          // select the second and quietly drop the first.
          EditorState.allowMultipleSelections.of(true),
          // Without this CodeMirror leaves selection drawing to the browser,
          // and the native selection can only show ONE range - so a block
          // chosen with the cue encoder was genuinely selected and simply not
          // drawn. It also generates .cm-selectionBackground, which crt-theme
          // has been styling all along with nothing to apply it to.
          drawSelection(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          // Ctrl+Enter and Ctrl+i are claimed by our global trigger map
          // (setActiveScript / insertSelectedSnippet). Swallow them here at
          // highest precedence so CodeMirror's own insertBlankLine /
          // selectParentSyntax commands never run; preventDefault() alone
          // (not stopPropagation) is what a handled binding triggers, so the
          // window-level keydown listener still receives the event and
          // dispatches our action.
          Prec.highest(
            keymap.of([
              { key: 'Ctrl-Enter', run: () => true },
              { key: 'Ctrl-i', run: () => true },
              { key: 'Ctrl-e', run: () => true },
            ]),
          ),
          javascript(),
          crtTheme,
          // After javascript(): both colour the same text, and the later
          // extension's inline style is what survives on a function name.
          functionColorExtension,
          functionColorTheme,
          cycleBadgeExtension,
          argMapExtension,
          cursorBlockExtension,
          browsedFnExtension,
          EditorView.lineWrapping,
          highlightExtension,
          // Caret and text changes both matter to the explainer: one changes
          // WHICH function is being described, the other changes the set of
          // functions in the song. Fires for this tab only; the listener
          // decides whether this tab is the one it cares about.
          EditorView.updateListener.of((update) => {
            if (update.selectionSet || update.docChanged) cursorListener(id);
          }),
        ],
      }),
    });

    const record = { id, name, view, wrapper, bar: which };
    if (first) {
      // Tab order is Map insertion order, and a Map has no way to unshift, so
      // rebuild it. Order is not cosmetic here: it decides the default
      // add/solo hold keys (Alt+1..9 are assigned by position) and the order
      // tabs are concatenated in before being sent to the parser.
      const rest = [...tabs.entries()];
      tabs.clear();
      tabs.set(id, record);
      for (const [key, value] of rest) tabs.set(key, value);
    } else {
      tabs.set(id, record);
    }
    if (!viewedId) viewTab(id);
    else renderBar();
    return id;
  }

  function viewTab(id) {
    if (!tabs.has(id)) return;
    for (const tab of tabs.values()) tab.wrapper.hidden = tab.id !== id;
    const changed = viewedId !== id;
    viewedId = id;
    renderBar();
    tabs.get(id).view.focus();
    cursorListener(id);
    if (changed) viewListener(id);
  }

  function currentView() {
    return viewedId ? tabs.get(viewedId).view : null;
  }

  /** Remove any live outline from `id`'s view - same effect as a frame with no matching haps. */
  function clearHighlight(id) {
    const tab = tabs.get(id);
    if (tab) highlightMiniLocations(tab.view, 0, []);
  }

  /**
   * Remove a tab and everything belonging to it.
   *
   * Refuses the last one: an editor with no tabs has no document, and every
   * caller here reads `getViewedId()` and uses it without asking whether one
   * exists. Returns what happened so the caller can report it.
   */
  function closeTab(id) {
    const tab = tabs.get(id);
    if (!tab) return { closed: false, reason: 'no such tab' };
    if (tabs.size < 2) return { closed: false, reason: 'last tab' };

    const wasActive = activeId === id;
    tab.view.destroy();
    tab.wrapper.remove();
    tabs.delete(id);
    if (wasActive) activeId = null;
    // Announced BEFORE the view moves, and for every close rather than only
    // the viewed one. onViewTab covers the common case by accident - closing
    // the viewed tab happens to switch views - but a mode holding a tab id
    // needs to hear about the close itself, not about a side effect of it.
    closeListener(id);
    if (viewedId === id) {
      viewedId = null;
      viewTab([...tabs.keys()][0]);
    } else {
      renderBar();
    }
    return { closed: true, wasActive };
  }

  return {
    addTab,
    viewTab,
    closeTab,
    clearHighlight,
    getTabs: () =>
      [...tabs.values()].map((t) => ({
        id: t.id,
        name: t.name,
        isActive: t.id === activeId,
        // Which strip the tab lives on. The clip pads address the SONG tabs,
        // and the bottom bar holds ripped-out material that is deliberately
        // not part of the set - so the two cannot share a numbering.
        bar: t.bar,
      })),
    setActiveTab(id) {
      if (!tabs.has(id)) return;
      if (activeId && activeId !== id) clearHighlight(activeId);
      activeId = id;
      renderBar();
      cursorListener(id);
    },
    getViewedId: () => viewedId,
    /** Whether `id` still names a tab - for anything holding one across time. */
    hasTab: (id) => tabs.has(id),
    getActiveId: () => activeId,
    getCode: (id) => tabs.get(id).view.state.doc.toString(),
    getName: (id) => tabs.get(id)?.name ?? null,
    /**
     * One short label per block, in block order - what the hold-to-unmute
     * config shows so a slot can be pointed at "the hats" rather than "3".
     */
    getBlockLabels(id) {
      const tab = tabs.get(id);
      if (!tab) return [];
      const lines = tab.view.state.doc.toString().split('\n');
      return listBlocks(lines).map((block) => {
        const first = lines[block.start].trim().replace(/^\/\/\s*/, '');
        return first.length > 40 ? `${first.slice(0, 39)}…` : first;
      });
    },
    getCursorPos: (id) => tabs.get(id)?.view.state.selection.main.head ?? null,
    /** Called with a tab id whenever that tab's caret moves or its text changes. */
    onCursorMove(cb) {
      cursorListener = cb;
    },
    /**
     * Called when a DIFFERENT tab comes on screen. Separate from onCursorMove,
     * which also fires for a caret nudge inside the same song - a block
     * selection made on the control surface has to survive that and be dropped
     * only when the song underneath it changes.
     */
    onViewTab(cb) {
      viewListener = cb;
    },
    /**
     * Called with the id of any tab that has just been removed.
     *
     * Separate from onViewTab because a tab can go away without the view
     * changing, and anything holding a tab id - pattern build, holds - is
     * then addressing a document that no longer exists. Every write here
     * guards on a missing tab and returns quietly, so without this the
     * failure is silence rather than an error.
     */
    onCloseTab(cb) {
      closeListener = cb;
    },
    insertAtCursor(text) {
      const view = currentView();
      if (!view) return;
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, insert: text },
        selection: { anchor: pos + text.length },
      });
      view.focus();
    },
    /**
     * Inserts `text` as its own block, after the block the caret is in, with a
     * blank line between them - never spliced into an existing line.
     *
     * The counterpart to insertAtCursor, and the difference is not cosmetic: a
     * snippet carrying its own `$:` and `setcpm` is a statement, and pasting a
     * statement into the middle of another one is a syntax error - which is
     * what the library did whenever the caret happened not to sit on a blank
     * line (`$: s` + `setcpm(...)` came out as `$: ssetcpm(...)`).
     */
    insertAsBlock(text) {
      const view = currentView();
      if (!view) return;
      const doc = view.state.doc;

      // An empty document takes the text as-is; anything else is appended
      // after the caret's block, separated by the blank line that is what
      // makes it a separate block at all (see findBlock).
      if (doc.length === 0) {
        view.dispatch({ changes: { from: 0, insert: text }, selection: { anchor: text.length } });
        view.focus();
        return;
      }
      const lines = doc.toString().split('\n');
      const caretLine = doc.lineAt(view.state.selection.main.head).number - 1;
      const block = findBlock(lines, caretLine);
      const anchorLine = block ? block.end : caretLine;
      const from = doc.line(anchorLine + 1).to;
      const insert = `\n\n${text}`;
      view.dispatch({
        changes: { from, insert },
        // Caret lands at the START of the inserted block, so it is what you
        // are looking at and what Ctrl+M would act on.
        selection: { anchor: from + 2 },
      });
      view.focus();
      // Where it landed, so the block cursor can follow it there.
      const after = view.state.doc.toString().split('\n');
      return listBlocks(after).findIndex((b) => b.start === anchorLine + 2);
    },
    /**
     * Toggles every block the selection touches. With no selection this is
     * the single block under the caret (`from === to`, so the range collapses
     * to one line) - the original behaviour, unchanged.
     */
    toggleBlocksInSelection() {
      const view = currentView();
      if (!view) return false;
      const lines = view.state.doc.toString().split('\n');
      const { from, to } = view.state.selection.main;
      const fromLine = view.state.doc.lineAt(from).number - 1;
      const toLine = view.state.doc.lineAt(to).number - 1;
      const blocks = findBlocksInRange(lines, fromLine, toLine);
      if (blocks.length === 0) return false;
      const next = toggleBlocksComment(lines, blocks).join('\n');
      // Keep the selection rather than collapsing it, so the same range can be
      // toggled back with a second press. Offsets shift by the comment markers
      // added or removed, so clamp instead of trying to track them.
      const clamp = (pos) => Math.min(pos, next.length);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: { anchor: clamp(from), head: clamp(to) },
      });
      if (viewedId === activeId) editListener(viewedId);
      return true;
    },
    onActiveEdit(cb) {
      editListener = cb;
    },
    /**
     * The blocks the selection touches in `id`, as `{ index, start, end }`.
     * The index is the position in block order, which is the same currency the
     * hold slots and live.js speak - so a rip can be described to the renderer
     * without passing line numbers that shift the moment anything is edited.
     */
    getSelectedBlocks(id) {
      const tab = tabs.get(id);
      if (!tab) return [];
      const doc = tab.view.state.doc;
      const lines = doc.toString().split('\n');
      const all = listBlocks(lines);
      // EVERY range, not just the main one. A selection made with the mouse
      // has exactly one, but the control surface pins blocks that are not
      // adjacent - and those can only be expressed as several ranges, so
      // reading `selection.main` alone would see just the last one pinned.
      const found = new Map();
      for (const range of tab.view.state.selection.ranges) {
        const fromLine = doc.lineAt(range.from).number - 1;
        const toLine = doc.lineAt(range.to).number - 1;
        for (const block of findBlocksInRange(lines, fromLine, toLine)) {
          found.set(block.start, {
            ...block,
            index: all.findIndex((b) => b.start === block.start),
          });
        }
      }
      return [...found.values()].sort((a, b) => a.start - b.start);
    },
    /**
     * The one block the selection covers, with its text and absolute offsets,
     * or null.
     *
     * Deliberately null for a multi-block selection rather than picking the
     * first: the knob bank addresses arguments by position, and pointing it at
     * one block of several would silently number the arguments of blocks the
     * user can see are also selected.
     */
    getSoleSelectedBlock(id) {
      const tab = tabs.get(id);
      if (!tab) return null;
      const blocks = this.getSelectedBlocks(id);
      if (blocks.length !== 1) return null;
      const doc = tab.view.state.doc;
      const block = blocks[0];
      if (block.end >= doc.lines) return null;
      const from = doc.line(block.start + 1).from;
      const to = doc.line(block.end + 1).to;
      return { ...block, from, to, text: doc.sliceString(from, to) };
    },
    /**
     * Draw (or clear) the knob-address rows under lines `from`..`to`. Pushed
     * to the one tab that owns them - unlike the cycle count, an arg map names
     * offsets in a specific document.
     */
    setArgMap(id, map) {
      const tab = tabs.get(id);
      if (!tab) return;
      tab.view.dispatch({ effects: setArgMap.of(map) });
    },
    /**
     * Overwrite one span of a tab's document, leaving the selection alone.
     *
     * This is how a knob writes: it replaces the digits of one argument and
     * nothing else, so the multi-range block selection the surface built stays
     * exactly where it was and the next turn addresses the same block.
     *
     * `notify: false` performs the edit WITHOUT telling the parser. A control
     * that writes hundreds of times a second needs that: every notification
     * queues a full re-render of the set (see live.js, which serialises them),
     * so a caller sweeping a knob has to coalesce its own re-evaluation rather
     * than emit one per message.
     */
    replaceRange(id, from, to, text, { notify = true } = {}) {
      const tab = tabs.get(id);
      if (!tab) return;
      tab.view.dispatch({ changes: { from, to, insert: text } });
      if (notify && id === activeId) editListener(id);
    },
    /**
     * The countdown shown on every highlighted block. Pushed to every tab, not
     * just the visible one: the crossfader is a global control, and a tab
     * switched to later would otherwise show a stale figure until it moved.
     */
    setCycleCount(count) {
      for (const tab of tabs.values()) {
        tab.view.dispatch({ effects: setCycleCount.of(count) });
      }
    },
    /**
     * Mark which selected block the knobs are on, or clear with null.
     *
     * Separate from the selection itself because they answer different
     * questions: the selection is what play, rip and Ctrl+M will act on, and
     * this is the one of them the eight knobs are currently editing.
     */
    setCursorBlock(id, index) {
      const tab = tabs.get(id);
      if (!tab) return;
      const block = index === null || index === undefined
        ? null
        : listBlocks(tab.view.state.doc.toString().split('\n'))[index];
      tab.view.dispatch({
        effects: setCursorBlock.of(block ? { from: block.start, to: block.end } : null),
      });
    },
    /**
     * One block by index, with its text and absolute offsets, or null.
     *
     * The knobs address the CURSOR block, which is one of possibly several
     * selected - so they cannot go through getSoleSelectedBlock, which
     * deliberately refuses a multi-block selection.
     */
    getBlockAt(id, index) {
      const tab = tabs.get(id);
      if (!tab || index === null || index === undefined) return null;
      const doc = tab.view.state.doc;
      const block = listBlocks(doc.toString().split('\n'))[index];
      if (!block || block.end >= doc.lines) return null;
      const from = doc.line(block.start + 1).from;
      const to = doc.line(block.end + 1).to;
      return { ...block, index, from, to, text: doc.sliceString(from, to) };
    },
    /** Outline the function TC 6 is on, or clear with null. */
    setBrowsedFn(id, span) {
      const tab = tabs.get(id);
      if (!tab) return;
      tab.view.dispatch({ effects: setBrowsedFn.of(span ?? null) });
    },
    /** How many blocks the tab holds - what the block cursor counts against. */
    getBlockCount(id) {
      const tab = tabs.get(id);
      if (!tab) return 0;
      return listBlocks(tab.view.state.doc.toString().split('\n')).length;
    },
    /**
     * Select exactly these blocks, by index, as one multi-range selection.
     *
     * This is how the control surface writes its choice back into the editor
     * rather than keeping a private set beside it: there is one selection in
     * this app, it is visible on screen, and every existing consumer - arm,
     * rip, Ctrl+M - already reads it.
     *
     * The LAST index becomes the main range, so it is the one the view
     * scrolls to. Callers pass the cursor block last for that reason.
     */
    selectBlocks(id, indexes) {
      const tab = tabs.get(id);
      if (!tab) return;
      const doc = tab.view.state.doc;
      const blocks = listBlocks(doc.toString().split('\n'));
      const ranges = indexes
        .map((i) => blocks[i])
        .filter(Boolean)
        .map((block) =>
          EditorSelection.range(
            doc.line(block.start + 1).from,
            doc.line(block.end + 1).to,
          ),
        );
      if (ranges.length === 0) return;
      tab.view.dispatch({
        selection: EditorSelection.create(ranges, ranges.length - 1),
        scrollIntoView: true,
      });
    },
    /**
     * Overwrite block `index` with `text`, keeping it selected.
     *
     * The block builder rewrites the SAME block on every pick - each new sound
     * is folded into its angle brackets - so this has to leave the selection
     * on it, or the knobs would come unbound from the thing being built the
     * moment a second sound was added.
     */
    replaceBlockText(id, index, text) {
      const tab = tabs.get(id);
      if (!tab) return;
      const doc = tab.view.state.doc;
      const block = listBlocks(doc.toString().split('\n'))[index];
      if (!block) return;
      const from = doc.line(block.start + 1).from;
      const to = doc.line(block.end + 1).to;
      tab.view.dispatch({ changes: { from, to, insert: text } });
      if (id === activeId) editListener(id);
    },
    /**
     * Put `text` on its own line at line `at`, pushing everything down.
     *
     * For the statements that have to lead the document - `setcpm`, `samples`
     * - which are picked from the library like anything else but cannot be
     * appended where the caret happens to be.
     */
    insertLine(id, at, text) {
      const tab = tabs.get(id);
      if (!tab) return;
      const doc = tab.view.state.doc;
      const clamped = Math.min(Math.max(at, 0), doc.lines - 1);
      const pos = doc.line(clamped + 1).from;
      tab.view.dispatch({ changes: { from: pos, insert: `${text}\n` } });
      if (id === activeId) editListener(id);
    },
    /** Replace a tab's whole document. Used to drop ripped blocks out of it. */
    setCode(id, text) {
      const tab = tabs.get(id);
      if (!tab) return;
      tab.view.dispatch({
        changes: { from: 0, to: tab.view.state.doc.length, insert: text },
        selection: { anchor: Math.min(tab.view.state.selection.main.head, text.length) },
      });
    },
    /** Append `text` as its own block at the end of a tab - the landing site of a rip. */
    appendBlock(id, text) {
      const tab = tabs.get(id);
      if (!tab) return null;
      const doc = tab.view.state.doc;
      const insert = doc.length === 0 ? text : `\n\n${text}`;
      tab.view.dispatch({ changes: { from: doc.length, insert } });
      // The index it landed at, so the caller can put the cursor on it. Read
      // after the dispatch, because that is when the block exists.
      return listBlocks(tab.view.state.doc.toString().split('\n')).length - 1;
    },
    /**
     * The paper rip: the doomed lines curl, fold along their middle, and drop
     * away. Purely decorative, and deliberately fire-and-forget - it paints a
     * clone of the lines into an overlay and animates THAT, so the real
     * document is never mid-transform when the removal lands on it.
     *
     * Resolves when the animation is over. A tab that is not on screen has no
     * geometry to measure, so it resolves immediately rather than animating
     * something nobody can see.
     */
    ripAnimate(id, blocks) {
      const tab = tabs.get(id);
      if (!tab || tab.id !== viewedId || blocks.length === 0) return Promise.resolve();
      const doc = tab.view.state.doc;
      const scroller = tab.view.scrollDOM;
      const overlay = document.createElement('div');
      overlay.className = 'rip-overlay';

      for (const block of blocks) {
        const topLine = doc.line(Math.min(block.start + 1, doc.lines));
        const bottomLine = doc.line(Math.min(block.end + 1, doc.lines));
        const top = tab.view.coordsAtPos(topLine.from);
        const bottom = tab.view.coordsAtPos(bottomLine.to);
        if (!top || !bottom) continue;
        const box = scroller.getBoundingClientRect();
        const shred = document.createElement('div');
        shred.className = 'rip-shred';
        shred.style.top = `${top.top - box.top + scroller.scrollTop}px`;
        shred.style.height = `${Math.max(bottom.bottom - top.top, 4)}px`;
        shred.textContent = doc.sliceString(topLine.from, bottomLine.to);
        overlay.append(shred);
      }
      if (!overlay.children.length) return Promise.resolve();

      scroller.append(overlay);
      return new Promise((resolve) => {
        // Belt and braces: `animationend` can never fire if the element is
        // hidden mid-flight (tab switched away), and the caller is waiting on
        // this before it deletes text. The timer guarantees it resolves.
        const done = () => {
          overlay.remove();
          resolve();
        };
        setTimeout(done, 900);
        overlay.addEventListener('animationend', done, { once: true });
      });
    },
    /** Push the transpiler's mini-notation locations for `id`'s code into its view, after eval. */
    setMiniLocations(id, locations) {
      const tab = tabs.get(id);
      if (!tab) return;
      updateMiniLocations(tab.view, locations ?? []);
    },
    /**
     * Show currently-sounding haps as outlines, on the VIEWED tab's view only.
     *
     * Viewed rather than active because more than one tab can be playing at
     * once now (a held add/solo key folds other tabs into the parser), and
     * only one of them is on screen. Each tab carries its own rebased
     * mini-locations - see live.js - so a non-contributing tab simply has none
     * to match and stays clean.
     */
    highlight(haps, atTime) {
      if (!viewedId) return;
      const tab = tabs.get(viewedId);
      if (!tab) return;
      highlightMiniLocations(tab.view, atTime, haps);
    },
  };
}
