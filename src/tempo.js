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

import { maskCode, replaceInCode } from './args.js';

/**
 * The song's tempo in BPM, or null when it declares none.
 *
 * Null rather than a default, because "this song has no tempo" and "this song
 * is at 120" are different facts and only one of them is safe to write back.
 */
export function songBpm(code) {
  // Read through the mask: a `setcpm` inside a comment or a string is not the
  // song's tempo, and taking it as one would report a number nothing plays at.
  const masked = maskCode(code ?? '');
  const found = CPM_CALL.exec(masked);
  const match = found && CPM_CALL.exec((code ?? '').slice(found.index, found.index + found[0].length));
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
  return replaceInCode(code, CPM_CALL_G, (whole, num, den) =>
    den === undefined
      ? whole.replace(num, String(value / 4))
      : whole.replace(num, String(value)),
  );
}

/** Whether the song declares a tempo at all. */
export function hasTempo(code) {
  return CPM_CALL.test(maskCode(code ?? ''));
}

/**
 * How long a tempo change takes, in cycles. Zero is a hard cut.
 *
 * Cycles rather than seconds because a tempo blend is judged against the
 * music: "over the next eight bars" is a musical instruction, and eight bars
 * is a different number of seconds at each end of the ramp.
 *
 * WHY THE RAMP IS DRIVEN FROM HERE AND NOT WRITTEN INTO THE PATTERN.
 *
 * Strudel's tempo IS patternable, though nothing in the docs says so: the
 * Cyclist reads `cps` off each hap and retimes the clock, so `.cps(0.75)`
 * moves the transport and `.cps(saw.range(0.5, 1).slow(4))` sweeps it - both
 * measured, the sweep stepping smoothly through sixteen values.
 *
 * It is not used for this because `saw` REPEATS. A patterned ramp saws the
 * tempo back down every n cycles, which is a tempo wobble - a fine effect, and
 * not what a blend is. A blend has to arrive and stay, and a one-shot is not
 * naturally expressible that way.
 *
 * Both routes end at the same place: a hap carrying cps assigns
 * `scheduler.cps`, which is exactly what setTransportCps does. The difference
 * is only where the ramp lives, and a one-shot belongs in the performance
 * rather than in the source.
 */
export const RAMP_RANGE = { min: 0, max: 32 };

export function clampRamp(cycles) {
  return Math.min(Math.max(Math.round(cycles), RAMP_RANGE.min), RAMP_RANGE.max);
}

/** BPM to cycles-per-second, at four beats to the bar. */
export const bpmToCps = (bpm) => bpm / 4 / 60;

/**
 * The tempo partway through a ramp.
 *
 * Interpolated in BPM rather than in cps, because BPM is what the ramp was
 * asked for in and the two are not the same curve - a linear sweep of cps
 * spends longer at the slow end, which is audible as a blend that drags and
 * then rushes.
 *
 * `t` is progress 0..1 and is clamped, so a ramp that overruns its last frame
 * lands exactly on the target rather than past it.
 */
export function rampBpm(from, to, t) {
  const clamped = Math.min(Math.max(t, 0), 1);
  return from + (to - from) * clamped;
}

/**
 * How far a ramp has progressed, from the cycle it started on.
 *
 * Measured in CYCLES off the transport rather than in wall-clock time,
 * because the thing being changed is what turns cycles into seconds - a timer
 * would drift against the music it is supposed to be blending.
 */
export function rampProgress(startCycle, nowCycle, cycles) {
  if (cycles <= 0) return 1;
  return Math.min(Math.max((nowCycle - startCycle) / cycles, 0), 1);
}
