import apc40 from './apc40-map.json';

/**
 * Turns raw MIDI from a mapped control surface into NAMED controls.
 *
 * The map in apc40-map.json is imported verbatim from
 * https://github.com/OfficerPlotTwist/AKAI-pro-APC40-mapping - built from a
 * ~1000-second capture of every physical control on the unit, not from a
 * datasheet, and re-checked against those 3,725 raw messages in both
 * directions.
 *
 * Why this exists at all: triggers.js speaks `note:53` and `cc:7`, which throw
 * the MIDI channel away. On this surface the channel IS the track. `note:53`
 * is "clip 1" on eight different tracks, and until something reads the channel
 * those eighty buttons are eight buttons wearing eighty hats. Only
 * (type, number, channel) names a physical control.
 *
 * Three address classes, and they disagree about what the channel means:
 *
 *   per_track     channel is fixed to the control's own track (faders, the
 *                 clip grid, solo/cue, record arm)
 *   track_scoped  channel is whichever track is SELECTED (the device knobs)
 *   global        always channel 0 (crossfader, scenes, transport)
 *
 * Selection is the awkward one. The nine select buttons send no note at all -
 * pressing one makes the APC40 re-transmit its stored device-knob values as a
 * burst of CC 16-23 on the newly selected channel. So the only evidence a
 * selection changed is which channel those knobs arrive on, which is what
 * `resolve` watches for.
 */

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CC = 0xb0;

/** The device knobs, whose channel reports the selected track. */
const SELECTION_CC_MIN = 16;
const SELECTION_CC_MAX = 23;

const addressKey = (type, number, channel) => `${type}:${number}:${channel}`;

/**
 * `(type, number, channel)` -> `{ control, track }`.
 *
 * `track` is the label this ADDRESS belongs to, which for a per_track control
 * is its own track and for a track_scoped one is the track that was selected
 * when the message was sent - the same value either way, because both are just
 * the channel read through the map's channel_map.
 */
export function buildIndex(map) {
  const index = new Map();
  for (const control of map.controls) {
    for (const [label, channel] of Object.entries(control.channels)) {
      index.set(addressKey(control.type, control.number, channel), {
        control,
        // `global` is a class, not a track: those controls belong to no track
        // and reporting one would invite a binding that looks per-track.
        track: label === 'global' ? null : label,
      });
    }
  }
  return index;
}

/** Splits a raw message into the parts an address is made of, or null. */
function address(data) {
  const [status, d1, d2] = data;
  const type = status & 0xf0;
  const channel = status & 0x0f;
  if (type === NOTE_ON || type === NOTE_OFF) return { type: 'note', number: d1, channel, d2 };
  if (type === CC) return { type: 'cc', number: d1, channel, d2 };
  // Pitch bend, aftertouch, clock: this surface sends none of them, and a
  // control that was never observed must not be guessable from a message.
  return null;
}

/**
 * What one message means, as a number.
 *
 * Buttons are 1/0 rather than raw velocity: every note control on this surface
 * is a switch, and the APC40 sends full velocity for all of them, so velocity
 * carries no information a binding could use.
 */
function decodeValue(control, raw, isRelease) {
  if (control.type === 'note') return isRelease ? 0 : 1;
  if (control.mode === 'relative') {
    // Documented encoding, measured: 1..24 clockwise, 112..127 counter-
    // clockwise. Magnitude is turn speed, and 64 is never sent because it
    // would mean a zero delta.
    return raw > 64 ? raw - 128 : raw;
  }
  const [min, max] = control.value_range ?? [0, 127];
  return (raw - min) / (max - min);
}

export function createDeviceMap(map = apc40) {
  const index = buildIndex(map);
  const listeners = new Set();
  let selectedTrack = null;

  /** Pure lookup: names an address without touching selection state. */
  function describe(type, number, channel) {
    const entry = index.get(addressKey(type, number, channel));
    if (!entry) return null;
    return {
      name: entry.control.name,
      label: entry.control.label,
      class: entry.control.class,
      track: entry.control.class === 'track_scoped' ? selectedTrack ?? entry.track : entry.track,
    };
  }

  return {
    device: map.device,
    inPort: map.in_port,
    outPort: map.out_port,
    describe,

    get selectedTrack() {
      return selectedTrack;
    },

    /** Called with the new track label whenever the selection CHANGES. */
    onSelect(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    /** Every control name, sorted - the binding vocabulary. */
    names() {
      return map.controls.map((c) => c.name).sort();
    },

    /**
     * Decodes one raw message, updating selection as a side effect. Returns
     * null for anything this device does not have - including a control that
     * is physically present but electrically dead (the master fader), which
     * the map records as a fault rather than a control precisely so nothing
     * can be bound to an address that will never arrive.
     */
    resolve(data) {
      const addr = address(data);
      if (!addr) return null;
      const entry = index.get(addressKey(addr.type, addr.number, addr.channel));
      if (!entry) return null;

      const { control } = entry;
      if (
        control.type === 'cc' &&
        control.class === 'track_scoped' &&
        control.number >= SELECTION_CC_MIN &&
        control.number <= SELECTION_CC_MAX &&
        entry.track !== selectedTrack
      ) {
        selectedTrack = entry.track;
        for (const listener of listeners) listener(selectedTrack);
      }

      // Note-off and zero-velocity note-on are the MIDI spec's two ways of
      // saying the same thing.
      const isButton = control.type === 'note';
      const isRelease = isButton && ((data[0] & 0xf0) === NOTE_OFF || addr.d2 === 0);

      return {
        name: control.name,
        label: control.label,
        class: control.class,
        type: control.type,
        number: control.number,
        channel: addr.channel,
        track: control.class === 'track_scoped' ? selectedTrack : entry.track,
        behavior: control.behavior ?? null,
        value: decodeValue(control, addr.d2, isRelease),
        isDown: isButton ? !isRelease : null,
      };
    },
  };
}
