import { javascript } from '@codemirror/lang-javascript';
import { EditorSelection, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { highlightExtension, highlightMiniLocations, updateMiniLocations } from '@strudel/codemirror';
import { findBlock, findBlocksInRange, listBlocks, toggleBlocksComment } from './blocks.js';
import { crtTheme } from './crt-theme.js';

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

  function addTab(name, code = '', { bar: which = 'top', first = false } = {}) {
    counter += 1;
    const id = `tab-${counter}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'tab-view';
    wrapper.hidden = true;
    host.append(wrapper);

    const view = new EditorView({
      parent: wrapper,
      state: EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(),
          // Off by default, and without it CodeMirror silently keeps only the
          // main range - so pinning two blocks from the control surface would
          // select the second and quietly drop the first.
          EditorState.allowMultipleSelections.of(true),
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

  return {
    addTab,
    viewTab,
    clearHighlight,
    getTabs: () =>
      [...tabs.values()].map((t) => ({ id: t.id, name: t.name, isActive: t.id === activeId })),
    setActiveTab(id) {
      if (!tabs.has(id)) return;
      if (activeId && activeId !== id) clearHighlight(activeId);
      activeId = id;
      renderBar();
      cursorListener(id);
    },
    getViewedId: () => viewedId,
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
      if (!tab) return;
      const doc = tab.view.state.doc;
      const insert = doc.length === 0 ? text : `\n\n${text}`;
      tab.view.dispatch({ changes: { from: doc.length, insert } });
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
