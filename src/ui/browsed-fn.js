import { Decoration, EditorView } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';

/**
 * The function TC 6 is currently on, outlined in the editor.
 *
 * Without it the knob scrolls a selection nobody can see: the library tab
 * changes underneath as the cursor moves between a sample call and an effect,
 * and there is nothing on screen saying which word caused it. The outline is
 * on the NAME rather than the whole call, because the name is what a pick
 * replaces for an effect - what you can see is what would change.
 */

/** Dispatch with `{ from, to }` (document offsets) or null. */
export const setBrowsedFn = StateEffect.define();

const browsedFn = StateField.define({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setBrowsedFn)) return effect.value;
    }
    // An edit moves the span it named; drop it rather than outline the wrong
    // word. The caller recomputes on the same change.
    return transaction.docChanged ? null : value;
  },
});

const mark = EditorView.decorations.compute([browsedFn, 'doc'], (state) => {
  const builder = new RangeSetBuilder();
  const at = state.field(browsedFn);
  if (!at || at.to > state.doc.length || at.from >= at.to) return builder.finish();
  builder.add(at.from, at.to, Decoration.mark({ class: 'cm-browsed-fn' }));
  return builder.finish();
});

export const browsedFnExtension = [browsedFn, mark];
