/**
 * FX chains: a saved snippet of Strudel method calls with some of its numbers
 * marked as knob-controlled slots.
 *
 * The stored form is a template:
 *
 *     .room(<size .4: 0..1>).lpf(<cut 900: 20..8000 log>)
 *
 * Each `<...>` is one slot - a label, a default, a range, and optionally `log`
 * for a range that should be swept logarithmically. Filter cutoff is the
 * reason `log` exists: 20..8000 mapped linearly puts everything musically
 * interesting in the bottom eighth of the knob's travel.
 *
 * Declaring the range in the entry rather than inferring it from the function
 * name is deliberate. Strudel's docs carry no ranges (src/strudel-docs.json
 * has description, params and category, and nothing numeric), so inference
 * would mean a hand-written table that silently guesses wrong for anything
 * custom. Here the chain that says what it wants is the chain that behaves.
 */

/** `<label default: min..max>` or `<label default: min..max log>`. */
const SLOT = /<([^\s>]+)\s+(-?[\d.]+)\s*:\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)(\s+log)?>/g;

/** Every knob-controlled slot in a template, in left-to-right order. */
export function parseSlots(template) {
  const slots = [];
  for (const match of template.matchAll(SLOT)) {
    const [, label, def, min, max, log] = match;
    slots.push({
      label,
      default: Number(def),
      min: Number(min),
      max: Number(max),
      log: Boolean(log),
    });
  }
  return slots;
}

/** The starting knob values for a template: whatever it declared as defaults. */
export function defaultValues(template) {
  return parseSlots(template).map((slot) => slot.default);
}

/**
 * Maps a raw 0-127 pot reading onto one slot's range.
 *
 * Log slots are mapped in log space so the knob's travel is spread evenly
 * across octaves rather than across hertz. A log range through or below zero
 * is meaningless, so those fall back to linear rather than producing NaN.
 */
export function knobToValue(slot, raw) {
  const t = Math.min(Math.max(raw, 0), 127) / 127;
  if (slot.log && slot.min > 0 && slot.max > 0) {
    return Math.exp(Math.log(slot.min) + t * (Math.log(slot.max) - Math.log(slot.min)));
  }
  return slot.min + t * (slot.max - slot.min);
}

/**
 * Is this slot a whole-number parameter?
 *
 * Inferred from the slot declaring itself entirely in integers. That is a
 * reliable tell in practice: `<bits 8: 1..16>` and `<voices 1: 1..7>` count
 * things, while `<wet .5: 0..1>` and `<size 2: 0.5..6>` measure them, and
 * whoever wrote the entry picked those numbers to say so.
 *
 * It matters because `.unison(3.47)` and `.octave(2.7)` are not parameters
 * anybody meant, and a knob that can only ever produce them is a knob that
 * does not work.
 */
function isIntegerSlot(slot) {
  return Number.isInteger(slot.min) && Number.isInteger(slot.max) && Number.isInteger(slot.default);
}

/**
 * Rounds a slot value for display and for writing into source.
 *
 * Counting parameters land on whole numbers. Everything else gets enough
 * decimals that the knob's 128 steps are actually distinguishable across the
 * range - three for a range under 2, because `.delaytime(0.375)` is a dotted
 * eighth and `.delaytime(0.38)` is a mistake.
 */
export function formatValue(slot, value) {
  const span = slot.max - slot.min;
  const decimals = isIntegerSlot(slot) ? 0 : span < 2 ? 3 : span < 20 ? 2 : 1;
  const fixed = value.toFixed(decimals);
  // Trim trailing zeros so 0.500 reads as 0.5, but never leave a bare "0." .
  return decimals ? fixed.replace(/\.?0+$/, '') || '0' : fixed;
}

/** The template with its slots filled in: plain, runnable Strudel source. */
export function renderChain(template, values = []) {
  const slots = parseSlots(template);
  let i = 0;
  return template.replace(SLOT, () => {
    const slot = slots[i];
    const value = values[i] ?? slot.default;
    i += 1;
    return formatValue(slot, value);
  });
}

/**
 * The method names a rendered chain calls, at the TOP level only.
 *
 * Depth matters: `.jux(x => x.lpf(400))` calls jux, not lpf. Treating that
 * inner lpf as top-level would make an approved `.lpf(2000)` reach inside the
 * jux and rewrite the thing the jux exists to make different.
 */
export function chainMethods(chain) {
  const names = [];
  let depth = 0;
  for (let i = 0; i < chain.length; i += 1) {
    const char = chain[i];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === '.' && depth === 0) {
      const name = /^[A-Za-z_$][\w$]*/.exec(chain.slice(i + 1))?.[0];
      if (name) names.push(name);
    }
  }
  return names;
}

/**
 * Finds a top-level `.name(...)` call in `code`, or null.
 *
 * Scans for the balanced closing paren rather than the next one, so a call
 * whose argument contains parens (`.lpf(saw.range(200,2000))`) is matched in
 * full instead of being cut in half.
 */
function findCall(code, name) {
  const pattern = new RegExp(`\\.${name}\\s*\\(`, 'g');
  for (const match of code.matchAll(pattern)) {
    // Only a call at chain depth 0 is ours to replace.
    if (depthAt(code, match.index) !== 0) continue;
    let depth = 0;
    for (let i = match.index + match[0].length - 1; i < code.length; i += 1) {
      if (code[i] === '(') depth += 1;
      else if (code[i] === ')') {
        depth -= 1;
        if (depth === 0) return { start: match.index, end: i + 1 };
      }
    }
  }
  return null;
}

/** Paren nesting depth at a position - 0 means "not inside any call". */
function depthAt(code, index) {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    if (code[i] === '(') depth += 1;
    else if (code[i] === ')') depth -= 1;
  }
  return depth;
}

/**
 * Applies a rendered chain to one block of source.
 *
 * A method the block already calls at the top level is REPLACED in place;
 * anything else is appended to the end. That is what makes the same chain
 * re-approvable: dial the filter, approve, dial again, approve again, and the
 * block ends up with one `.lpf(...)` rather than a stack of dead ones.
 *
 * The chain is appended to the LAST non-blank, non-comment line of the block,
 * because a Strudel block is one statement spread over several lines and the
 * chain has to land at the end of that statement, not the end of the text.
 * A trailing semicolon is stepped over for the same reason.
 */
export function applyChain(blockLines, chain) {
  const methods = chainMethods(chain);
  const lines = [...blockLines];

  // Replace in place wherever the block already calls one of these methods.
  let remaining = chain;
  for (const name of methods) {
    const call = extractCall(remaining, name);
    if (!call) continue;
    for (let i = 0; i < lines.length; i += 1) {
      const found = findCall(lines[i], name);
      if (!found) continue;
      lines[i] = lines[i].slice(0, found.start) + call + lines[i].slice(found.end);
      remaining = remaining.replace(call, '');
      break;
    }
  }

  if (!remaining.trim()) return lines;

  let target = lines.length - 1;
  while (target > 0 && (lines[target].trim() === '' || lines[target].trim().startsWith('//'))) {
    target -= 1;
  }
  const line = lines[target];
  const semi = line.trimEnd().endsWith(';');
  lines[target] = semi
    ? line.trimEnd().slice(0, -1) + remaining + ';'
    : line.trimEnd() + remaining;
  return lines;
}

/** One `.name(...)` call, sliced out of a rendered chain. */
function extractCall(chain, name) {
  const found = findCall(chain, name);
  return found ? chain.slice(found.start, found.end) : null;
}
