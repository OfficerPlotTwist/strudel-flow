/**
 * Makes an absolute APC40 knob behave like the cue encoder: signed deltas,
 * turn speed in the magnitude, and no endstop.
 *
 * This is a port of relative.py from the mapping repo
 * (github.com/OfficerPlotTwist/AKAI-pro-APC40-mapping, RELATIVE.md), and it is
 * a port rather than a dependency on purpose. That script owns the MIDI port
 * for its read-modify-write loop, and its own documentation warns that two
 * processes re-centering the same knob will fight - so with the script running,
 * this app would be the second owner. Whoever reads the knob has to be the one
 * writing it back.
 *
 * Two measured facts from FINDINGS.md make it work at all:
 *
 *   1. A knob's value is a counter inside the APC40, not a pot position, and
 *      writing to the knob's own CC moves that counter.
 *   2. The APC40 does not echo host writes - 80 consecutive writes produced 0
 *      incoming messages - so the write can happen inside the read loop
 *      without feeding itself.
 *
 * The knob parks at 64, giving 63 steps of travel either way. Each message
 * yields a delta. Only when the value drifts within `guard` of a rail is 64
 * written back, which is roughly once per half-rotation - re-centering on
 * every message instead would issue a write per message, and a fast turn sends
 * 200 a second.
 */

export const DEFAULTS = { center: 64, guard: 12, scale: 1 };

/**
 * One knob's step: what moved, and whether it now needs parking.
 *
 * The delta is reported even on the step that triggers a re-centre - that
 * movement is real and swallowing it would drop a step at every rail.
 */
export function stepRelative(last, value, { center, guard, scale } = DEFAULTS) {
  const delta = Math.round((value - last) * scale);
  const recenter = value <= guard || value >= 127 - guard;
  return { delta, recenter, last: recenter ? center : value };
}

/**
 * A set of knobs under relative control.
 *
 * `send(name, value)` writes a CC value back to the named knob; the caller
 * owns knowing which port and channel that is. `feed(control)` takes a decoded
 * control from device-map.js and returns `{ name, delta }` for a managed knob
 * or null for anything else - so it drops into an existing MIDI loop and
 * everything it does not recognise falls through untouched.
 */
export function createRelativeBank({ knobs = [], send, ...options } = {}) {
  const settings = new Map();
  const last = new Map();
  for (const entry of knobs) {
    const config = typeof entry === 'string' ? { name: entry } : entry;
    settings.set(config.name, { ...DEFAULTS, ...options, ...config });
    last.set(config.name, (config.center ?? options.center ?? DEFAULTS.center));
  }

  return {
    names: () => [...settings.keys()],

    /** Write every managed knob to its park position. */
    park() {
      for (const [name, config] of settings) {
        last.set(name, config.center);
        send?.(name, config.center);
      }
    },

    feed(control) {
      const config = control?.name ? settings.get(control.name) : null;
      if (!config) return null;
      // device-map reports absolute CCs as 0..1; the knob counter is 0..127
      // and every threshold here is expressed in counter steps.
      const raw = Math.round((control.value ?? 0) * 127);
      const step = stepRelative(last.get(control.name), raw, config);
      last.set(control.name, step.last);
      if (step.recenter) send?.(control.name, config.center);
      return { name: control.name, delta: step.delta };
    },
  };
}
