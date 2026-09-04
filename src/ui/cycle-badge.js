import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';

/**
 * The countdown the crossfader is currently dialling in, shown at the right
 * end of every highlighted block.
 *
 * Arming is the one action on this surface whose amount is set by a control
 * with no readout of its own: a crossfader has a physical position the app
 * cannot see until it moves, and the number of cycles it means is invisible
 * until the change has already been committed. Putting the figure on the
 * selection answers "how long will this take" at the moment the question is
 * being asked - beside the blocks it will happen to, rather than in a status
 * line at the other end of the screen.
 *
 * Drawn in negative space: the selection is a light wash, so the badge inverts
 * it rather than adding a third colour to a screen that only has two.
 */

/** Dispatch to change the number every badge shows. */
export const setCycleCount = StateEffect.define();

const cycleCount = StateField.define({
  create: () => 0,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setCycleCount)) return effect.value;
    }
    return value;
  },
});

class CycleBadge extends WidgetType {
  constructor(count) {
    super();
    this.count = count;
  }

  // Without this CodeMirror rebuilds the DOM node on every recompute, which
  // for a widget inside a live selection is every caret move.
  eq(other) {
    return other.count === this.count;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-cycle-badge';
    span.textContent = String(this.count);
    // The badge is a readout, not text: it must never be selectable, and a
    // click on it belongs to the line underneath.
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

const badges = EditorView.decorations.compute(['selection', cycleCount], (state) => {
  const count = state.field(cycleCount);
  const builder = new RangeSetBuilder();
  // One per highlighted range, at its right-hand end. Sorted and de-duplicated
  // because RangeSetBuilder requires ascending positions and two ranges
  // ending at the same point would be added twice.
  const ends = [...new Set(state.selection.ranges.filter((r) => !r.empty).map((r) => r.to))].sort(
    (a, b) => a - b,
  );
  for (const at of ends) {
    builder.add(at, at, Decoration.widget({ widget: new CycleBadge(count), side: 1 }));
  }
  return builder.finish();
});

export const cycleBadgeExtension = [cycleCount, badges];
