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
 * Controls that are perfectly good parameters and still must never reach a
 * knob, because CHANGING them is expensive rather than because the value is
 * wrong.
 *
 * Every one of these rebuilds the reverb's impulse response when it moves -
 * Strudel's own docs say so, and say to change them sparingly. A knob emits up
 * to two hundred values a second, so binding one would recalculate the reverb
 * two hundred times a second on the audio thread. That is the same failure as
 * re-rendering the whole set per MIDI message (see scheduleArgRefresh in
 * main.js), one layer down, where there is no trailing edge to coalesce onto.
 *
 * `room` itself is not here: it is a send level, and moving it costs nothing.
 */
export const RECALCULATING = new Set([
  'roomsize', 'size', 'roomdim', 'rdim', 'roomfade', 'rfade', 'roomlp',
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

  // Multi-argument calls declare one range PER POSITION, in order. `adsr` is
  // the reason this shape exists: every block the builder makes carries one,
  // so it is the most-turned control on the surface, and its four numbers are
  // four different quantities - three times and a level.
  adsr: [
    { min: 0, max: 4 },   // attack
    { min: 0, max: 4 },   // decay
    { min: 0, max: 1 },   // sustain - a level, not a time
    { min: 0, max: 8 },   // release
  ],
};

/**
 * The nine channels the APC40 can select, in select-button order, and the
 * eight device knobs on each. The labels are what the annotation prints, so
 * they read as the button under the user's finger rather than an array index.
 */
export const ARG_TRACKS = ['1', '2', '3', '4', '5', '6', '7', '8', 'master'];
/**
 * The eight tracks a PART is dealt across.
 *
 * Master is deliberately not among them: it is reserved for the song's master
 * block, so those eight knobs mean the same thing no matter which part is
 * selected - which is the whole of what a master section is. Dealing a part
 * into it would make the master filter become somebody's decay time as soon as
 * a block with more than 64 arguments came along.
 */
export const PART_TRACKS = ARG_TRACKS.slice(0, 7);
/**
 * Track 8 is the reverb pair, and master is the block's output stage. Both are
 * RESERVED: a part is dealt across tracks 1-7 only, so these two keep meaning
 * the same thing whichever block is under the cursor.
 *
 * That constancy is the entire point. A knob whose meaning depends on how many
 * numbers the selected block happens to contain cannot be reached for without
 * looking, and looking is the thing a control surface exists to avoid.
 */
export const REVERB_TRACK = '8';
export const MASTER_TRACK = 'master';

/**
 * The block's output stage, in knob order, on the master track.
 *
 * Per BLOCK, not per song. A song-wide `all(x => x.adsr(...))` would not shape
 * each part's envelope, it would overwrite it - including the envelope the
 * block builder writes - and the per-block attack knob would silently stop
 * doing anything. An envelope is a per-event control and belongs to the part
 * that sounds it.
 *
 * `postgain` rather than `gain` for a reason that is not about the curve:
 * blocks routinely carry their own `.gain()`, and binding that here would give
 * one number two addresses - a part knob and the master knob, each overwriting
 * the other. `.postgain()` is rare in hand-written blocks, so master owns it.
 */
export const MASTER_CONTROLS = [
  { fn: 'adsr', position: 0, label: 'attack' },
  { fn: 'adsr', position: 1, label: 'decay' },
  { fn: 'adsr', position: 2, label: 'sustain' },
  { fn: 'adsr', position: 3, label: 'release' },
  { fn: 'lpf', position: 0, label: 'lpf' },
  { fn: 'hpf', position: 0, label: 'hpf' },
  { fn: 'postgain', position: 0, label: 'postgain' },
];

/** The reverb pair on track 8, appended to a block that has none. */
/**
 * Track 8: the reverb pair - and the two knobs are deliberately at DIFFERENT
 * scopes, because that is what the two controls are.
 *
 * `room` is a per-event send amount (superdough calls `sendReverb(node,
 * amount)` per voice), so it is cheap and belongs to the block. `roomsize` is
 * a property of the orbit's single reverb node, and superdough's own source
 * annotates the failure of getting this wrong:
 *
 *     // avoids endless regeneration on things like
 *     //   stack(s("a"), s("b").rsize(8)).room(.5)
 *
 * Two blocks on one orbit carrying different sizes regenerate the impulse
 * response PER EVENT. So there is exactly one roomsize per song, and it is
 * `shared` - written to the reverb bus statement, not to the block.
 *
 * This is also how a mixing desk works: the send is on the channel, the
 * reverb's size is on the bus.
 */
export const REVERB_CONTROLS = [
  { fn: 'room', position: 0, label: 'room', default: 0.2 },
  // Continuous, and spanning what the app's own FX chains declare for this
  // same parameter (seed-fx/space.js uses 0.5..6, 4..10 and 0.5..10). A
  // stepped 1..8 knob could not reach either end of the presets it shares a
  // name with, which is two parts of one codebase describing one control
  // differently.
  { fn: 'roomsize', position: 0, label: 'size', default: 2, shared: true, min: 0.5, max: 10 },
];

/** Defaults written the first time a master knob is touched on a block. */
export const MASTER_DEFAULTS = { adsr: [0.01, 0.1, 0.6, 0.2], lpf: 20000, hpf: 20, postgain: 1 };

/**
 * Binds a fixed set of controls to one track, whether or not the block already
 * calls them.
 *
 * A control the block does not have yet becomes a VIRTUAL slot: it has an
 * address and a value but no offsets, and the first turn of its knob writes
 * the call into the source. That is what keeps the master track meaning the
 * same thing on every block - waiting for the block to happen to contain a
 * `.postgain()` would make the master volume work on some parts and not
 * others, which is worse than not having it.
 *
 * Returns `{ slots, claimed }`; `claimed` is the set of block arguments now
 * spoken for, so the positional dealer can skip them and no number ends up
 * with two knobs fighting over it.
 */
export function bindFixedControls(args, controls, track) {
  const claimed = new Set();
  const slots = controls.map((control, i) => {
    const found = args.find(
      (arg) =>
        !claimed.has(arg) && arg.fn === control.fn && (arg.position ?? 0) === control.position,
    );
    if (found) claimed.add(found);
    const value = found
      ? found.value
      : (control.default ??
        (Array.isArray(MASTER_DEFAULTS[control.fn])
          ? MASTER_DEFAULTS[control.fn][control.position]
          : MASTER_DEFAULTS[control.fn]) ??
        0);
    return {
      fn: control.fn,
      position: control.position,
      label: control.label,
      shared: Boolean(control.shared),
      value,
      // A control that declares its own range owns it; anything else falls to
      // the table. Hardcoding a range here is how the reverb size ended up
      // disagreeing with every other declaration of the same parameter.
      range:
        control.min !== undefined
          ? { min: control.min, max: control.max, log: false, integer: Boolean(control.integer) }
          : rangeFor(control.fn, value, control.position),
      // Absent from the source: no offsets, and writing it appends the call.
      virtual: !found,
      from: found?.from ?? null,
      to: found?.to ?? null,
      line: found?.line ?? null,
      col: found?.col ?? null,
      track,
      knob: i + 1,
      cc: KNOB_CC_BASE + i,
      channel: ARG_TRACKS.indexOf(track),
    };
  });
  return { slots, claimed };
}

/** The source text for a call this block does not have yet. */
export function callText(slot, text) {
  if (slot.fn !== 'adsr') return `.${slot.fn}(${text})`;
  // adsr is one call with four numbers; writing `.adsr(0.2)` would silently
  // mean an attack of 0.2 and defaults for the rest.
  const values = [...MASTER_DEFAULTS.adsr];
  values[slot.position] = text;
  return `.adsr(${values.join(', ')})`;
}
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
 * Replace matches of `pattern` that occur in real CODE, leaving comments and
 * string literals alone.
 *
 * The song-global controls rewrite every declaration of a thing at once - the
 * key knob every `.scale()`, the tempo knob every `setcpm()`. Scanning the raw
 * text also rewrote the ones inside comments and inside strings, so turning a
 * knob mid-set silently edited documentation and any `.label("...")` that
 * happened to mention the call.
 *
 * Matching happens against the MASKED copy, which is the same length, so every
 * offset found there indexes the real source directly.
 *
 * `mask` chooses WHAT to hide, and the choice is not free: the default blanks
 * comments and string literals, which is right for `setcpm(87 / 4)` but wrong
 * for `.scale("c:major")` - there the argument IS a string, so blanking
 * strings hides the very thing being matched. Pass a comment-only mask for a
 * call whose argument is legitimately quoted.
 */
export function replaceInCode(code, pattern, replacer, mask = maskCode) {
  const text = code ?? '';
  const masked = mask(text);
  const scan = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let out = '';
  let at = 0;
  let match;
  while ((match = scan.exec(masked))) {
    // The masked match tells us WHERE; the replacement is computed from the
    // real text, so captures carry their true contents.
    const real = text.slice(match.index, match.index + match[0].length);
    const groups = new RegExp(pattern.source, pattern.flags.replace('g', '')).exec(real);
    out += text.slice(at, match.index) + replacer(...(groups ?? [real]));
    at = match.index + match[0].length;
    if (match[0].length === 0) scan.lastIndex += 1;
  }
  return out + text.slice(at);
}

/**
 * `name(<number>)` where the WHOLE argument is one numeric literal.
 *
 * Requiring the whole argument is the cheap way to skip every call whose value
 * is already being driven by something: `.lpf(perlin.range(220, 780))` and
 * `.pan(sine.range(0.4, 0.6))` are patterns, and replacing one with a constant
 * would delete the movement rather than adjust it.
 */
const NUMBER = String.raw`-?(?:\d+\.?\d*|\.\d+)`;
const CALL = new RegExp(
  String.raw`([A-Za-z_$][\w$]*)\s*\(\s*(${NUMBER}(?:\s*,\s*${NUMBER})*)\s*\)`,
  'g',
);
const LITERAL = new RegExp(NUMBER, 'g');

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
    const [, fn, argList] = match;
    if (EXCLUDED.has(fn) || RECALCULATING.has(fn)) continue;
    // A name preceded by a word character is the tail of a longer identifier
    // (`myGain(2)` is not `gain`), which the pattern alone cannot see.
    const before = masked[match.index - 1];
    if (before && /[\w$]/.test(before)) continue;
    // One slot per argument, not per call: `.adsr(0.01, 0.1, 0.6, 0.2)` is
    // four separate controls that happen to share a pair of parentheses.
    const listAt = match.index + match[0].indexOf(argList, fn.length);
    LITERAL.lastIndex = 0;
    let literalMatch;
    let position = 0;
    while ((literalMatch = LITERAL.exec(argList))) {
      const literal = literalMatch[0];
      const from = listAt + literalMatch.index;
      let line = 0;
      while (line + 1 < lineStarts.length && lineStarts[line + 1] <= from) line += 1;
      args.push({
        fn,
        position,
        value: Number(literal),
        text: literal,
        from: from + offset,
        to: from + literal.length + offset,
        line,
        col: from - lineStarts[line],
      });
      position += 1;
    }
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
export function rangeFor(fn, value, position = 0) {
  const declared = ARG_RANGES[fn];
  // An array declares one range per argument position. A call with more
  // arguments than the table describes falls through to the value-derived
  // guess for the extras rather than reusing the last range, which would be a
  // confident claim about a parameter nobody wrote down.
  const known = Array.isArray(declared) ? declared[position] : declared;
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
export function assignArgSlots(args, tracks = ARG_TRACKS) {
  return args.slice(0, tracks.length * KNOBS_PER_TRACK).map((arg, i) => {
    const track = tracks[Math.floor(i / KNOBS_PER_TRACK)];
    return {
      ...arg,
      range: rangeFor(arg.fn, arg.value, arg.position ?? 0),
      track,
      knob: (i % KNOBS_PER_TRACK) + 1,
      // The wire address the (track, knob) pair means: CC 16..23 on the
      // channel of that track. Taken from the FULL track list, not from
      // `tracks` - a slot dealt only to master still arrives on channel 8.
      cc: KNOB_CC_BASE + (i % KNOBS_PER_TRACK),
      channel: ARG_TRACKS.indexOf(track),
    };
  });
}

/**
 * What the annotation prints under an argument: track, then device knob.
 *
 * Bare rather than quoted. The quotes were noise - nothing here is a string,
 * and at four characters instead of eight the label is half as likely to
 * collide with the one beside it, which means more of them keep the true
 * column of the number they point at.
 */
export function slotLabel(slot) {
  return `${slot.track}:${slot.knob}`;
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
