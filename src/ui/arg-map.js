import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';

/**
 * The knob addresses of the selected block, drawn as a row of labels beneath
 * each of its lines.
 *
 * A knob binding that is not written down is a binding you have to remember,
 * and there are seventy-two of them. Putting `"3":"5"` directly under the
 * number it drives answers "which knob is this" in the place the question is
 * asked - under the argument - rather than in a legend somewhere else.
 *
 * Every line of the block gets a row, including the lines with no arguments.
 * The empty rows are the point as much as the full ones: they double-space the
 * block while it is addressed, which both makes room for the labels and marks
 * the block as the one the knobs are pointing at. Nothing is inserted into the
 * document - these are block widgets, so the code itself is untouched and the
 * knobs write into source that never grew a single character of annotation.
 */

/** Dispatch with `{ from, to, rows }` to annotate, or `null` to clear. */
export const setArgMap = StateEffect.define();

const argMap = StateField.define({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setArgMap)) return effect.value;
    }
    // A document edit moves every line under the map, and the map was computed
    // against the old text. Drop it rather than draw it in the wrong place;
    // the caller recomputes on the same change.
    return transaction.docChanged ? null : value;
  },
});

class ArgRow extends WidgetType {
  constructor(text) {
    super();
    this.text = text;
  }

  eq(other) {
    return other.text === this.text;
  }

  toDOM() {
    const div = document.createElement('div');
    div.className = this.text ? 'cm-arg-row' : 'cm-arg-row cm-arg-row-blank';
    // Text with its own padding rather than positioned spans: the editor is
    // monospace, so a run of spaces is the only alignment that cannot drift
    // from the code above it at any font size or zoom level.
    div.textContent = this.text || ' ';
    div.setAttribute('aria-hidden', 'true');
    return div;
  }

  ignoreEvent() {
    return true;
  }
}

const rows = EditorView.decorations.compute([argMap, 'doc'], (state) => {
  const builder = new RangeSetBuilder();
  const map = state.field(argMap);
  if (!map) return builder.finish();
  for (let line = map.from; line <= map.to && line < state.doc.lines; line += 1) {
    const at = state.doc.line(line + 1).to;
    builder.add(
      at,
      at,
      Decoration.widget({ widget: new ArgRow(map.rows[line - map.from] ?? ''), block: true, side: 1 }),
    );
  }
  return builder.finish();
});

export const argMapExtension = [argMap, rows];
