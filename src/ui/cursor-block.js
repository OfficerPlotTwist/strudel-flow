import { Decoration, EditorView } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';

/**
 * Which of the selected blocks the knobs are actually on.
 *
 * The selection can hold several blocks - the cue encoder scrolls a cursor and
 * REC pins what it passes - but the eight device knobs can only address one of
 * them. That one is wherever the cursor is, and until now nothing on screen
 * said so: every selected block wore the same wash, and the knobs were
 * silently editing one of them.
 *
 * Shown as displacement rather than as another colour. The screen already
 * spends its two colours on "selected" and "playing", and a third would have
 * to compete with both; nudging the block right and dropping a rule down its
 * left edge reads instantly and costs no colour at all. It is also honest
 * about what it marks - the bar is at the left margin, where the block starts,
 * not draped over the text.
 */

/** Dispatch with `{ from, to }` (0-based line numbers) or null. */
export const setCursorBlock = StateEffect.define();

const cursorBlock = StateField.define({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setCursorBlock)) return effect.value;
    }
    // An edit moves the lines under the mark, and it was computed against the
    // old text. Drop it rather than draw it in the wrong place; the caller
    // recomputes on the same change.
    return transaction.docChanged ? null : value;
  },
});

const marks = EditorView.decorations.compute([cursorBlock, 'doc'], (state) => {
  const builder = new RangeSetBuilder();
  const at = state.field(cursorBlock);
  if (!at) return builder.finish();
  for (let line = at.from; line <= at.to && line < state.doc.lines; line += 1) {
    const { from } = state.doc.line(line + 1);
    builder.add(from, from, Decoration.line({ class: 'cm-cursor-block' }));
  }
  return builder.finish();
});

export const cursorBlockExtension = [cursorBlock, marks];
