/**
 * The numeric arguments of a block, addressed as (track, device knob).
 *
 * A Strudel block is mostly two kinds of number. One kind IS the music - the
 * degrees in `n("0 2 4")`, the sample chosen by `s(...)`, the octave in
 * `note(-12)` - and turning a knob through those does not adjust a parameter,
 * it writes different notes. The other kind is a setting: `.gain(0.9)`,
 * `.lpf(260)`, `.shape(0.35)`. Only the second kind belongs on a knob, and
 * telling them apart is what most of this file does.
 *
 * The split is made by function NAME (see EXCLUDED) rather than by looking at
 * the number, because the same literal means both things depending on where it
 * sits: 3 in `.crush(3)` is a bit depth and 3 in `n(3)` is a scale degree.
 *
 * Addressing is deliberately positional and dense: arguments are numbered in
 * source order and dealt eight at a time across track1..track8 then master,
 * which is exactly the APC40's nine selectable channels times its eight device
 * knobs. Selecting a track re-points all eight knobs at the next eight
 * arguments - the same thing the hardware already does to itself, so the
 * surface and the code agree about what a selection means.
 */

/**
 * Functions whose numeric argument is pattern content, a bank, or a sound
 * definition - never a knobbable setting.
 *
 * `n`, `note`, `freq` and `midinote` name pitches; `s`/`sound`/`bank` name the
 * sample; `scale` names the key; `samples` loads a set. A knob over any of
 * them would transpose or re-voice the part rather than adjust it.
 */
export const EXCLUDED = new Set([
  'n', 'note', 'freq', 'midinote', 's', 'sound', 'bank', 'scale', 'samples',
]);

/**
 * The musically reasonable travel of each parameter - what "full knob" should
 * mean, which is never "the full domain of the function". `.lpf` accepts any
 * frequency and is useful between roughly 20 Hz and 8 kHz; `.gain` accepts
 * anything and is a fader past 2.
 *
 * These are the same ranges the FX templates declare by hand (see fx.js, which
 * explains why they cannot be read out of Strudel's docs - the docs carry
 * none), lifted into a table because a knob here binds to a number that is
 * ALREADY in the source and therefore arrived with no declaration attached.
 *
 * `log` spreads the travel over octaves rather than over hertz: 20..8000
 * mapped linearly puts every musically interesting cutoff in the bottom eighth
 * of the knob.
 */
export const ARG_RANGES = {
  gain: { min: 0, max: 2 },
  postgain: { min: 0, max: 2 },
  velocity: { min: 0, max: 1 },
  pan: { min: 0, max: 1 },
  shape: { min: 0, max: 0.99 },
  distort: { min: 0, max: 4 },
  crush: { min: 1, max: 16, integer: true },
  coarse: { min: 1, max: 32, integer: true },

  lpf: { min: 20, max: 8000, log: true },
  cutoff: { min: 20, max: 8000, log: true },
  hpf: { min: 20, max: 8000, log: true },
  bpf: { min: 20, max: 8000, log: true },
  lpq: { min: 0, max: 30 },
  hpq: { min: 0, max: 30 },
  resonance: { min: 0, max: 30 },

  attack: { min: 0, max: 4 },
  decay: { min: 0, max: 4 },
  sustain: { min: 0, max: 1 },
  release: { min: 0, max: 8 },
  hold: { min: 0, max: 4 },

  room: { min: 0, max: 1 },
  size: { min: 0.2, max: 8 },
  roomsize: { min: 0.2, max: 8 },
  dry: { min: 0, max: 1 },
  orbit: { min: 0, max: 7, integer: true },

  delay: { min: 0, max: 1 },
  delaytime: { min: 0.01, max: 1, log: true },
  delayfeedback: { min: 0, max: 0.95 },

  speed: { min: 0.25, max: 4, log: true },
  begin: { min: 0, max: 1 },
  end: { min: 0, max: 1 },
  cps: { min: 0.1, max: 4 },
  cpm: { min: 20, max: 400 },
  setcpm: { min: 20, max: 400 },
  setcps: { min: 0.1, max: 4 },

  fast: { min: 0.25, max: 8, log: true },
  slow: { min: 0.25, max: 8, log: true },
  degradeBy: { min: 0, max: 1 },
  undegradeBy: { min: 0, max: 1 },
  ply: { min: 1, max: 8, integer: true },
  chunk: { min: 1, max: 16, integer: true },
  segment: { min: 1, max: 32, integer: true },
  legato: { min: 0.05, max: 2 },
  clip: { min: 0.05, max: 2 },
  nudge: { min: -0.25, max: 0.25 },
  detune: { min: -1, max: 1 },
  vib: { min: 0, max: 16 },
  vibmod: { min: 0, max: 2 },
  unison: { min: 1, max: 7, integer: true },
  octave: { min: -2, max: 4, integer: true },
  transpose: { min: -24, max: 24, integer: true },
};

/**
 * The nine channels the APC40 can select, in select-button order, and the
 * eight device knobs on each. The labels are what the annotation prints, so
 * they read as the button under the user's finger rather than an array index.
 */
export const ARG_TRACKS = ['1', '2', '3', '4', '5', '6', '7', '8', 'master'];
export const KNOBS_PER_TRACK = 8;
/** The device knob bank is CC 16..23, track-scoped. See apc40-map.json. */
export const KNOB_CC_BASE = 16;

/**
 * A copy of `code` with every comment and string literal blanked to spaces.
 *
 * Byte-for-byte the same length on purpose: every offset found in the mask is
 * used directly against the real source. Blanking rather than deleting is the
 * same trick uncommentForPlayback uses, and for the same reason - an offset
 * that has slid is worse than no offset at all.
 *
 * It is what stops `s("bd*4")` and `// .gain(0.9)` from offering knobs: the
 * numbers inside mini-notation are pattern content, and a number inside a
 * comment is not running.
 */
export function maskCode(code) {
  const out = [...code];
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k += 1) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };
  while (i < code.length) {
    const two = code.slice(i, i + 2);
    if (two === '//') {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      blank(i, stop);
      i = stop;
    } else if (two === '/*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const quote = code[i];
      let j = i + 1;
      while (j < code.length && code[j] !== quote) j += code[j] === '\\' ? 2 : 1;
      const stop = Math.min(j + 1, code.length);
      blank(i, stop);
      i = stop;
    } else {
      i += 1;
    }
  }
  return out.join('');
}

/**
 * `name(<number>)` where the WHOLE argument is one numeric literal.
 *
 * Requiring the whole argument is the cheap way to skip every call whose value
 * is already being driven by something: `.lpf(perlin.range(220, 780))` and
 * `.pan(sine.range(0.4, 0.6))` are patterns, and replacing one with a constant
 * would delete the movement rather than adjust it.
 */
const CALL = /([A-Za-z_$][\w$]*)\s*\(\s*(-?(?:\d+\.?\d*|\.\d+))\s*\)/g;

/**
 * Every knobbable numeric argument in `code`, in source order.
 *
 * Offsets are relative to `code`; pass `offset` to rebase them onto the
 * document the block was sliced out of. `line` is the 0-based line WITHIN
 * `code`, which is what the annotation rows are keyed by.
 */
export function findNumericArgs(code, offset = 0) {
  const masked = maskCode(code);
  const lineStarts = [0];
  for (let i = 0; i < code.length; i += 1) if (code[i] === '\n') lineStarts.push(i + 1);

  const args = [];
  CALL.lastIndex = 0;
  let match;
  while ((match = CALL.exec(masked))) {
    const [, fn, literal] = match;
    if (EXCLUDED.has(fn)) continue;
    // A name preceded by a word character is the tail of a longer identifier
    // (`myGain(2)` is not `gain`), which the pattern alone cannot see.
    const before = masked[match.index - 1];
    if (before && /[\w$]/.test(before)) continue;
    const from = match.index + match[0].indexOf(literal, fn.length);
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= from) line += 1;
    args.push({
      fn,
      value: Number(literal),
      text: literal,
      from: from + offset,
      to: from + literal.length + offset,
      line,
      col: from - lineStarts[line],
    });
  }
  return args;
}

/**
 * The range a knob should sweep for one argument.
 *
 * An unlisted function falls back to a range built from the value already in
 * the source - 0..1 for anything fractional, 0..2x for anything larger. That
 * is a guess, and a deliberately conservative one: it always contains the
 * current value, so the knob starts where the code already is and the first
 * turn is a nudge rather than a jump.
 */
export function rangeFor(fn, value) {
  const known = ARG_RANGES[fn];
  if (known) return { log: false, integer: false, ...known };
  const magnitude = Math.abs(value);
  if (magnitude <= 1) return { min: 0, max: 1, log: false, integer: false };
  return { min: 0, max: Math.ceil(magnitude * 2), log: false, integer: Number.isInteger(value) };
}

const clamp01 = (t) => Math.min(Math.max(t, 0), 1);
// A log sweep through or below zero is meaningless, so it falls back to linear
// rather than producing NaN - the same guard fx.js makes.
const logOk = (range) => Boolean(range.log) && range.min > 0 && range.max > 0;

/** Where on a 0..127 pot an argument's current value sits. */
export function valueToKnob(range, value) {
  const t = logOk(range)
    ? (Math.log(Math.max(value, Number.MIN_VALUE)) - Math.log(range.min)) /
      (Math.log(range.max) - Math.log(range.min))
    : (value - range.min) / (range.max - range.min);
  return Math.round(clamp01(t) * 127);
}

/** What a 0..127 pot reading means as an argument value. */
export function knobToValue(range, raw) {
  const t = clamp01(raw / 127);
  const value = logOk(range)
    ? Math.exp(Math.log(range.min) + t * (Math.log(range.max) - Math.log(range.min)))
    : range.min + t * (range.max - range.min);
  return range.integer ? Math.round(value) : value;
}

/**
 * An argument value as source text: enough decimals that the knob's 128 steps
 * are distinguishable across the range, and no more.
 *
 * The same rule fx.js uses, because a knob that writes `.delaytime(0.38)`
 * where the music wanted `0.375` has quietly turned a dotted eighth into a
 * mistake.
 */
export function formatArgValue(range, value) {
  if (range.integer) return String(Math.round(value));
  const span = Math.abs(range.max - range.min);
  const decimals = span < 2 ? 3 : span < 20 ? 2 : 1;
  const fixed = value.toFixed(decimals);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') || '0' : fixed;
}

/**
 * Deals the arguments across the nine tracks, eight knobs each, in source
 * order. Anything past the 72nd gets no address rather than wrapping onto a
 * knob that already has one - two arguments on one knob is not a control.
 */
export function assignArgSlots(args) {
  return args.slice(0, ARG_TRACKS.length * KNOBS_PER_TRACK).map((arg, i) => ({
    ...arg,
    range: rangeFor(arg.fn, arg.value),
    track: ARG_TRACKS[Math.floor(i / KNOBS_PER_TRACK)],
    knob: (i % KNOBS_PER_TRACK) + 1,
    // The wire address the (track, knob) pair means: CC 16..23 on the
    // channel of the selected track. See device-map.js.
    cc: KNOB_CC_BASE + (i % KNOBS_PER_TRACK),
    channel: Math.floor(i / KNOBS_PER_TRACK),
  }));
}

/** What the annotation prints under an argument: track, then device knob. */
export function slotLabel(slot) {
  return `"${slot.track}":"${slot.knob}"`;
}

/**
 * The annotation row for each line of the block: labels laid out at the column
 * of the argument they belong to.
 *
 * Built as padded text rather than as positioned elements because the editor
 * is monospace and a run of spaces is the only alignment that cannot drift
 * from the code above it. Labels that would collide are pushed right by a
 * single space rather than overlapping - the leftmost keeps its true column,
 * and that is the one being pointed at.
 *
 * A row is returned for EVERY line, including empty strings: the blank rows
 * are the whitespace under the block, and they are what stops an annotated
 * line from looking like it belongs to the code beneath it.
 */
export function argRows(slots, lineCount) {
  const rows = Array.from({ length: lineCount }, () => '');
  const byLine = new Map();
  for (const slot of slots) {
    if (slot.line >= lineCount) continue;
    if (!byLine.has(slot.line)) byLine.set(slot.line, []);
    byLine.get(slot.line).push(slot);
  }
  for (const [line, list] of byLine) {
    let row = '';
    for (const slot of [...list].sort((a, b) => a.col - b.col)) {
      const at = Math.max(slot.col, row.length ? row.length + 1 : 0);
      row = row.padEnd(at, ' ') + slotLabel(slot);
    }
    rows[line] = row;
  }
  return rows;
}
