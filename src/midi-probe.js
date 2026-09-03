/**
 * Works out what each physical control on a MIDI surface actually IS, from
 * nothing but the messages it sends.
 *
 * This exists because the alternative is guessing. An APC40's CC numbers, and
 * which of its knobs are absolute pots versus endless encoders, are facts
 * about the box in the room - not something to hard-code from memory and
 * discover is wrong during a set. Turn every control for two seconds and this
 * reports the map.
 *
 * Everything here is pure: it takes messages and returns a report. The panel
 * that displays it is in ui/midi-monitor.js.
 */

/** How many of a control's recent values to keep for classification. */
const WINDOW = 64;

export function emptyProbe() {
  return { controls: new Map(), total: 0 };
}

/** `cc:74`, `note:36` - the same shape triggers.js already speaks. */
export function controlKey(data) {
  const [status, d1] = data;
  const type = status & 0xf0;
  if (type === 0xb0) return `cc:${d1}`;
  if (type === 0x90 || type === 0x80) return `note:${d1}`;
  return null;
}

/**
 * Folds one raw message into the probe. Mutates and returns the probe: this
 * runs on every MIDI message during a sweep, and a controller being wiggled
 * emits hundreds per second.
 */
export function observe(probe, data, now = Date.now(), port = null) {
  const key = controlKey(data);
  if (!key) return probe;
  const [status, , d2] = data;
  const type = status & 0xf0;
  // Note-off and zero-velocity note-on are the same event said two ways; the
  // probe cares about presses, so releases are recorded but not counted as
  // value samples that would drag a pad's range down to zero.
  const isRelease = type === 0x80 || (type === 0x90 && d2 === 0);

  let entry = probe.controls.get(key);
  if (!entry) {
    // `port` is recorded because the monitor listens to EVERY input, not just
    // the chosen control surface: "which of these ports is the APC40" is one
    // of the questions the map has to answer.
    entry = {
      key,
      port,
      channel: status & 0x0f,
      count: 0,
      values: [],
      gaps: [],
      last: null,
      releases: 0,
    };
    probe.controls.set(key, entry);
  }
  entry.count += 1;
  probe.total += 1;
  if (entry.last !== null) {
    entry.gaps.push(now - entry.last);
    if (entry.gaps.length > WINDOW) entry.gaps.shift();
  }
  entry.last = now;
  if (isRelease) {
    entry.releases += 1;
    return probe;
  }
  entry.values.push(d2);
  if (entry.values.length > WINDOW) entry.values.shift();
  return probe;
}

function median(numbers) {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Decodes a relative two's-complement CC value into a signed delta.
 *
 * This is the encoding the APC40's endless encoder uses: turning one way
 * counts UP from 1, turning the other counts DOWN from 127, and in both cases
 * the distance from the wrap point is how fast you turned. 64 would be a zero
 * delta and is therefore never sent.
 */
export function relativeDelta(value) {
  return value <= 63 ? value : value - 128;
}

/**
 * What kind of control is this?
 *
 * The tell for an endless encoder is a value distribution clumped at BOTH ends
 * of the range with nothing in the middle - because 1 and 127 are "one tick
 * either way", which is what slow turning produces almost exclusively. An
 * absolute pot does the opposite: swept end to end it visits the middle, and
 * it reaches the true extremes 0 and 127.
 *
 * `unsure` is a real answer, not a failure. Ten messages is not enough to tell
 * a pot from an encoder, and saying so is better than a confident wrong map.
 */
export function classify(entry) {
  if (entry.key.startsWith('note:')) {
    return entry.releases > 0 ? 'pad (note, sends release)' : 'pad (note, no release seen)';
  }
  const values = entry.values;
  if (values.length < 12) return 'unsure (turn it more)';

  const unique = new Set(values);
  const nearEnds = values.filter((v) => v <= 8 || v >= 120).length / values.length;
  const middle = values.filter((v) => v > 16 && v < 112).length / values.length;
  const sawZero = unique.has(0);
  const sawSixtyFour = unique.has(64);

  // Encoder: lives at the ends, never sends 0 or 64 (both mean "no movement"
  // in this encoding, so a working encoder has no reason to emit them).
  if (nearEnds > 0.7 && !sawZero && !sawSixtyFour) return 'encoder (relative, two’s complement)';
  // Pot: swept through the middle of its travel, and reached a true endpoint.
  if (middle > 0.3 && unique.size > 10) return 'pot (absolute 0–127)';
  if (unique.size <= 3) return `switch/button (values: ${[...unique].join(', ')})`;
  return 'unsure (sweep it end to end)';
}

/**
 * The finished map, busiest control first, ready to print or paste into a
 * binding table.
 */
export function report(probe) {
  return [...probe.controls.values()]
    .map((entry) => ({
      key: entry.key,
      port: entry.port,
      channel: entry.channel,
      count: entry.count,
      min: entry.values.length ? Math.min(...entry.values) : null,
      max: entry.values.length ? Math.max(...entry.values) : null,
      last: entry.values.length ? entry.values[entry.values.length - 1] : null,
      // Median rather than mean: one pause mid-sweep would drag an average
      // into nonsense, and what we want is the rate while actually moving.
      medianGapMs: median(entry.gaps),
      kind: classify(entry),
    }))
    .sort((a, b) => b.count - a.count);
}

/** The report as pasteable text, for getting the map out of the browser. */
export function reportText(probe) {
  const rows = report(probe);
  if (rows.length === 0) return 'no MIDI seen yet';
  return rows
    .map(
      (r) =>
        `${r.key.padEnd(10)} ${String(r.port ?? '?').padEnd(24)} ch${String(r.channel + 1).padEnd(3)} n=${String(r.count).padEnd(5)}` +
        ` range=${r.min}..${r.max} last=${r.last} gap=${r.medianGapMs ?? '-'}ms  ${r.kind}`,
    )
    .join('\n');
}
