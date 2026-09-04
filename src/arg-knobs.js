import { KNOB_CC_BASE, KNOBS_PER_TRACK, formatArgValue, knobToValue, valueToKnob } from './args.js';

/** `apc40.device.knob3` -> 3, or null for anything that is not a device knob. */
export function deviceKnobIndex(name) {
  const match = /^apc40\.device\.knob([1-8])$/.exec(name ?? '');
  return match ? Number(match[1]) : null;
}

/**
 * The eight device knobs, driving the numeric arguments of the selected block.
 *
 * Two facts about this hardware shape the whole design:
 *
 *   1. The device knobs are absolute pots, not encoders. An absolute pot is
 *      the RIGHT control for this - the knob's position IS the value, so there
 *      is no drift and no acceleration to tune - but only if the pot is
 *      standing where the code already is. Otherwise the first touch snaps
 *      `.gain(0.9)` to whatever the pot was left at. `prime` is what stops
 *      that: it writes each argument's current value back into the knob's
 *      counter (a measured property of this unit - see relative.js), so the
 *      hardware starts the block already in position.
 *
 *   2. Pressing a track select button makes the APC40 re-transmit all eight
 *      stored knob values as a burst of CC 16-23 on the new channel. That
 *      burst is indistinguishable from eight simultaneous turns, and taken at
 *      face value it would rewrite eight arguments every time the user changed
 *      track. It is rejected by value rather than by a timer: because `prime`
 *      wrote those counters, the burst carries exactly the readings already on
 *      record, and a reading equal to the last one is not a turn.
 *
 * `send(channel, cc, value)` writes to the surface; `apply(slot, value)`
 * rewrites the source. Both are injected so the whole thing is testable
 * without MIDI or an editor.
 */
export function createArgKnobs({ send, apply } = {}) {
  let slots = [];
  // Address -> the last 0..127 reading known for it, whether we wrote it or
  // the user turned it. Keyed by channel so each track keeps its own eight.
  const known = new Map();
  const key = (channel, knob) => `${channel}:${knob}`;

  return {
    get slots() {
      return slots;
    },

    /**
     * Adopt a new set of slots and park the hardware on them.
     *
     * Called whenever the addressed block changes. `known` is cleared first:
     * the readings it held describe the arguments of a block that is no longer
     * the one being edited, and keeping them would silently swallow the first
     * turn of any knob that happens to land on the same number.
     */
    prime(next = []) {
      slots = next;
      known.clear();
      for (const slot of slots) {
        const raw = valueToKnob(slot.range, slot.value);
        known.set(key(slot.channel, slot.knob), raw);
        send?.(slot.channel, slot.cc, raw);
      }
      return slots.length;
    },

    /**
     * Take an updated set of slots for the SAME arguments without touching the
     * hardware.
     *
     * Used after a knob write: the offsets and the value have moved, but the
     * knob is already standing exactly where the new value says it should be.
     * Re-priming there would send eight CCs per message, and these pots emit
     * up to two hundred messages a second.
     */
    adopt(next = []) {
      slots = next;
    },

    /** Forget the mapping - no block is addressed, so no knob does anything. */
    clear() {
      slots = [];
      known.clear();
    },

    /** The slot a decoded control addresses, or null. */
    slotFor(control) {
      const knob = deviceKnobIndex(control?.name);
      if (knob === null) return null;
      return slots.find((s) => s.track === control.track && s.knob === knob) ?? null;
    },

    /**
     * Handle one decoded control. Returns true when it was a device knob this
     * bank owns - so the caller knows not to also run it as a binding - and
     * false for everything else, which falls through untouched.
     */
    feed(control) {
      const slot = this.slotFor(control);
      if (!slot) return false;
      // device-map reports an absolute CC as 0..1; the knob counter is 0..127
      // and every reading here is in counter steps.
      const raw = Math.round((control.value ?? 0) * 127);
      const at = key(slot.channel, slot.knob);
      if (known.get(at) === raw) return true; // the selection burst, or no movement
      known.set(at, raw);
      const value = knobToValue(slot.range, raw);
      apply?.(slot, value, formatArgValue(slot.range, value));
      return true;
    },
  };
}

/** The wire address of one (track index, knob number) pair. */
export function knobAddress(channel, knob) {
  return { channel, cc: KNOB_CC_BASE + ((knob - 1) % KNOBS_PER_TRACK) };
}
