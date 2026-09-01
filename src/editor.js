import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { findBlock, toggleBlockComment } from './blocks.js';
import { crtTheme } from './crt-theme.js';

export function createEditorPane(container) {
  const tabs = new Map(); // id -> { id, name, view, wrapper }
  const bar = document.createElement('nav');
  bar.className = 'tab-bar';
  const host = document.createElement('div');
  host.className = 'tab-host';
  container.append(bar, host);

  let viewedId = null;
  let activeId = null;
  let editListener = () => {};
  let counter = 0;

  function renderBar() {
    bar.innerHTML = '';
    for (const tab of tabs.values()) {
      const button = document.createElement('button');
      button.textContent = tab.name;
      button.className = 'tab';
      if (tab.id === viewedId) button.classList.add('viewed');
      if (tab.id === activeId) button.classList.add('active');
      button.addEventListener('click', () => viewTab(tab.id));
      bar.append(button);
    }
  }

  function addTab(name, code = '') {
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
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          javascript(),
          crtTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && id === activeId) editListener(id);
          }),
        ],
      }),
    });

    tabs.set(id, { id, name, view, wrapper });
    if (!viewedId) viewTab(id);
    else renderBar();
    return id;
  }

  function viewTab(id) {
    if (!tabs.has(id)) return;
    for (const tab of tabs.values()) tab.wrapper.hidden = tab.id !== id;
    viewedId = id;
    renderBar();
    tabs.get(id).view.focus();
  }

  function currentView() {
    return viewedId ? tabs.get(viewedId).view : null;
  }

  return {
    addTab,
    viewTab,
    getTabs: () =>
      [...tabs.values()].map((t) => ({ id: t.id, name: t.name, isActive: t.id === activeId })),
    setActiveTab(id) {
      if (!tabs.has(id)) return;
      activeId = id;
      renderBar();
    },
    getViewedId: () => viewedId,
    getActiveId: () => activeId,
    getCode: (id) => tabs.get(id).view.state.doc.toString(),
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
    toggleBlockAtCursor() {
      const view = currentView();
      if (!view) return false;
      const lines = view.state.doc.toString().split('\n');
      const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number - 1;
      const block = findBlock(lines, cursorLine);
      if (!block) return false;
      const next = toggleBlockComment(lines, block.start, block.end).join('\n');
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
      if (viewedId === activeId) editListener(viewedId);
      return true;
    },
    onActiveEdit(cb) {
      editListener = cb;
    },
  };
}
