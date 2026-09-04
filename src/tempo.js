/**
 * The song's tempo, as the one number a performer thinks in.
 *
 * Strudel counts CYCLES per minute; a musician counts beats. Every song in
 * this app writes the conversion out loud - `setcpm(87 / 4)` is "87 BPM, four
 * beats to the bar" - and that form is worth preserving rather than collapsing
 * to a single number, because the 4 is the time signature and losing it makes
 * the tempo unreadable.
 *
 * So the knob edits the NUMERATOR and leaves the divisor alone. A song written
 * as a bare `setcpm(30)` has no divisor to preserve and is read as cycles,
 * which at four beats to the bar is 120 BPM.
 */

/** `setcpm(87 / 4)` or `setcpm(30)`. */
const CPM_CALL = /\bsetcpm\s*\(\s*(-?[\d.]+)\s*(?:\/\s*(-?[\d.]+)\s*)?\)/;
const CPM_CALL_G = new RegExp(CPM_CALL.source, 'g');

/** What a knob may sweep. Below 40 nothing reads as a pulse; above 220 nothing plays. */
export const BPM_RANGE = { min: 40, max: 220 };

/**
 * The song's tempo in BPM, or null when it declares none.
 *
 * Null rather than a default, because "this song has no tempo" and "this song
 * is at 120" are different facts and only one of them is safe to write back.
 */
export function songBpm(code) {
  const match = CPM_CALL.exec(code ?? '');
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  // With a divisor the numerator is already BPM - that is what the form says.
  // Without one the number is cycles per minute, which is bars per minute.
  return match[2] === undefined ? value * 4 : value;
}

/** Clamp to what the knob can reach. */
export function clampBpm(bpm) {
  return Math.min(Math.max(Math.round(bpm), BPM_RANGE.min), BPM_RANGE.max);
}

/**
 * Rewrite the song's tempo, keeping the form it was written in.
 *
 * Every `setcpm` in the song is changed, not just the first: a second one is
 * a tempo change the arrangement did not ask for, and leaving it behind would
 * make the knob appear to do nothing from that bar on.
 */
export function setSongBpm(code, bpm) {
  const value = clampBpm(bpm);
  return (code ?? '').replace(CPM_CALL_G, (whole, num, den) =>
    den === undefined
      ? whole.replace(num, String(value / 4))
      : whole.replace(num, String(value)),
  );
}

/** Whether the song declares a tempo at all. */
export function hasTempo(code) {
  return CPM_CALL.test(code ?? '');
}
