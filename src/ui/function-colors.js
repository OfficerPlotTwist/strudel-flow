import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { functionSpans } from '../changes.js';
import { functionColor } from '../palette.js';

/**
 * Tints every documented Strudel function in the editor with its own colour -
 * the same colour the explainer gives that function, so the word on the second
 * screen and the word under the caret are recognisably the same thing.
 *
 * Brightness carries the second fact: a function in a live block is at full
 * phosphor, one in a commented block keeps its hue and loses its brightness.
 * That makes a muted part visibly muted without making it a different colour,
 * which would read as different code rather than the same code turned off.
 *
 * Marks are rebuilt only when the document actually changes, not on every
 * view update: a scroll or a caret move cannot alter which functions exist or
 * which blocks are commented, and rescanning the whole document on caret
 * movement would rescan it on every keystroke twice.
 *
 * Deliberately NOT scoped to the viewport. Strudel's own playing-hap highlight
 * writes background colours over the same text, and the two have to agree
 * about ranges; recomputing this set on scroll would make the colours flicker
 * against a highlight that does not.
 */
function buildMarks(state) {
  const builder = new RangeSetBuilder();
  for (const span of functionSpans(state.doc.toString())) {
    builder.add(
      span.from,
      span.to,
      Decoration.mark({
        attributes: { style: `color: ${functionColor(span.name, span.live)}` },
        class: span.live ? 'fn-live' : 'fn-muted',
      }),
    );
  }
  return builder.finish();
}

export const functionColorExtension = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildMarks(view.state);
    }

    update(update) {
      if (update.docChanged) this.decorations = buildMarks(update.state);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/**
 * The colour is applied as an inline style so it can be per-function; this
 * only has to make sure nothing in the theme outranks it.
 */
export const functionColorTheme = EditorView.baseTheme({
  '.fn-live, .fn-muted': { transition: 'color 120ms linear' },
});
