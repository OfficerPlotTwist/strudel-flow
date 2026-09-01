import { EditorView } from '@codemirror/view';

export const crtTheme = EditorView.theme(
  {
    '&': { color: 'var(--phosphor)', backgroundColor: 'transparent', height: '100%' },
    '.cm-content': { fontFamily: 'inherit', caretColor: 'var(--phosphor)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--phosphor)' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--phosphor-dim)',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(125, 247, 168, 0.05)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(125, 247, 168, 0.2)',
    },
    '.cm-scroller': { overflow: 'auto' },
  },
  { dark: true },
);
