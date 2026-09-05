import { describe, expect, it } from 'vitest';
import map from '../src/apc40-map.json';
import { buildIndex, createDeviceMap } from '../src/device-map.js';

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const CC = 0xb0;

/** `[status|channel, d1, d2]` - the shape onMidiMessage delivers. */
const msg = (type, channel, d1, d2) => [type | channel, d1, d2];

describe('address index', () => {
  it('indexes every channel of every control', () => {
    const index = buildIndex(map);
    const addresses = map.controls.reduce((n, c) => n + Object.keys(c.channels).length, 0);
    expect(addresses).toBe(254);
    expect(index.size).toBe(addresses);
  });

  it('has no two controls on one address', () => {
    // The whole map rests on this: `note:53` alone is ambiguous across eight
    // tracks, and only (type, number, channel) names a physical button.
    const seen = new Map();
    for (const control of map.controls) {
      for (const channel of Object.values(control.channels)) {
        const key = `${control.type}:${control.number}:${channel}`;
        expect(seen.get(key)).toBeUndefined();
        seen.set(key, control.name);
      }
    }
  });
});

describe('per_track controls', () => {
  it('separates the same note number by channel', () => {
    const dev = createDeviceMap(map);
    // The bug this import exists to fix: both of these are `note:53` to
    // triggers.js, and they are different physical buttons.
    expect(dev.resolve(msg(NOTE_ON, 0, 53, 127)).name).toBe('apc40.track1.clip1');
    expect(dev.resolve(msg(NOTE_ON, 4, 53, 127)).name).toBe('apc40.track5.clip1');
  });

  it('reports the owning track', () => {
    const dev = createDeviceMap(map);
    const event = dev.resolve(msg(CC, 2, 7, 64));
    expect(event.name).toBe('apc40.track3.fader');
    expect(event.track).toBe('track3');
    expect(event.class).toBe('per_track');
  });
});

describe('track_scoped controls', () => {
  it('resolves the device knobs to whichever track sent them', () => {
    const dev = createDeviceMap(map);
    const event = dev.resolve(msg(CC, 4, 16, 40));
    expect(event.name).toBe('apc40.device.knob1');
    expect(event.track).toBe('track5');
  });

  it('tracks selection from the channel of a device-knob message', () => {
    // The 9 select buttons send no note at all; the only evidence of a
    // selection change is which channel CC 16-23 arrive on.
    const dev = createDeviceMap(map);
    expect(dev.selectedTrack).toBe(null);
    dev.resolve(msg(CC, 4, 16, 40));
    expect(dev.selectedTrack).toBe('track5');
    dev.resolve(msg(CC, 8, 20, 40));
    expect(dev.selectedTrack).toBe('master');
  });

  it('notifies on selection change, once per change', () => {
    const dev = createDeviceMap(map);
    const seen = [];
    dev.onSelect((track) => seen.push(track));
    dev.resolve(msg(CC, 2, 16, 10));
    dev.resolve(msg(CC, 2, 17, 11)); // same track, no second notification
    dev.resolve(msg(CC, 6, 16, 12));
    expect(seen).toEqual(['track3', 'track7']);
  });

  it('does not let a per_track message move the selection', () => {
    // A fader on track 8 arrives on channel 7 and means nothing about which
    // track is SELECTED - only CC 16-23 carry that.
    const dev = createDeviceMap(map);
    dev.resolve(msg(CC, 4, 16, 40));
    dev.resolve(msg(CC, 7, 7, 100));
    expect(dev.selectedTrack).toBe('track5');
  });
});

describe('global controls', () => {
  it('resolves on channel 0 with no owning track', () => {
    const dev = createDeviceMap(map);
    const event = dev.resolve(msg(CC, 0, 15, 64));
    expect(event.name).toBe('apc40.global.crossfader');
    expect(event.track).toBe(null);
    expect(event.class).toBe('global');
  });

  it('does not bank the track-control knobs by selection', () => {
    const dev = createDeviceMap(map);
    dev.resolve(msg(CC, 4, 16, 40)); // select track5
    const event = dev.resolve(msg(CC, 0, 48, 64));
    expect(event.name).toBe('apc40.trackctl.knob1');
    expect(event.track).toBe(null);
  });
});

describe('values', () => {
  it('normalises an absolute CC to 0..1', () => {
    const dev = createDeviceMap(map);
    expect(dev.resolve(msg(CC, 0, 15, 0)).value).toBe(0);
    expect(dev.resolve(msg(CC, 0, 15, 127)).value).toBe(1);
    expect(dev.resolve(msg(CC, 0, 15, 64)).value).toBeCloseTo(64 / 127, 5);
  });

  it('decodes the cue encoder as a signed delta', () => {
    // Documented encoding: 1..24 clockwise, 112..127 counter-clockwise.
    const dev = createDeviceMap(map);
    expect(dev.resolve(msg(CC, 0, 47, 3)).value).toBe(3);
    expect(dev.resolve(msg(CC, 0, 47, 127)).value).toBe(-1);
    expect(dev.resolve(msg(CC, 0, 47, 112)).value).toBe(-16);
  });

  it('reports both edges of a button', () => {
    const dev = createDeviceMap(map);
    expect(dev.resolve(msg(NOTE_ON, 0, 53, 127)).isDown).toBe(true);
    expect(dev.resolve(msg(NOTE_OFF, 0, 53, 0)).isDown).toBe(false);
    // A zero-velocity note-on is a release said the other way.
    expect(dev.resolve(msg(NOTE_ON, 0, 53, 0)).isDown).toBe(false);
  });

  it('leaves isDown null for continuous controls', () => {
    const dev = createDeviceMap(map);
    expect(dev.resolve(msg(CC, 0, 15, 64)).isDown).toBe(null);
  });
});

describe('unknown and broken addresses', () => {
  it('returns null for an address this device does not have', () => {
    const dev = createDeviceMap(map);
    expect(dev.resolve(msg(CC, 0, 120, 64))).toBe(null);
    // Right number, wrong channel: the crossfader is global, channel 0 only.
    expect(dev.resolve(msg(CC, 3, 15, 64))).toBe(null);
  });

  it('does not resolve controls known to transmit nothing', () => {
    // The master fader (CC 14) and bank-down arrow are physically present and
    // electrically dead on this unit; they are recorded as faults, not
    // controls, so nothing can be bound to an address that never arrives.
    const dev = createDeviceMap(map);
    expect(dev.resolve(msg(CC, 0, 14, 64))).toBe(null);
    expect(dev.resolve(msg(NOTE_ON, 0, 95, 127))).toBe(null);
    expect(map.faults.map((f) => f.name)).toContain('apc40.global.master_fader');
  });

  it('ignores message types the surface never sends', () => {
    const dev = createDeviceMap(map);
    expect(dev.resolve([0xe0, 0, 64])).toBe(null); // pitch bend
  });
});

describe('describe', () => {
  it('names an address without consuming it', () => {
    // The monitor labels rows it has already folded into the probe; doing so
    // must not move the selection state the live decoder depends on.
    const dev = createDeviceMap(map);
    dev.resolve(msg(CC, 4, 16, 40));
    expect(dev.describe('note', 55, 2).name).toBe('apc40.track3.clip3');
    expect(dev.describe('cc', 16, 1).name).toBe('apc40.device.knob1');
    expect(dev.selectedTrack).toBe('track5');
  });

  it('returns null for an unmapped address', () => {
    const dev = createDeviceMap(map);
    expect(dev.describe('cc', 120, 0)).toBe(null);
  });
});

describe('names', () => {
  it('lists every control once, sorted', () => {
    const dev = createDeviceMap(map);
    const names = dev.names();
    expect(names.length).toBe(map.controls.length);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(names);
    expect(names).toContain('apc40.track1.clip1');
  });
});

describe('device identity', () => {
  it('carries the port names the map was captured from', () => {
    const dev = createDeviceMap(map);
    expect(dev.device).toBe('Akai APC40');
    expect(dev.inPort).toBe('Akai APC40 0');
    expect(dev.outPort).toBe('Akai APC40 1');
  });
});

describe('latching buttons', () => {
  // Confirmed on the hardware with the MIDI monitor: these buttons keep their
  // own state. One press sends velocity 1, the NEXT press sends 0, and there
  // is no release message between them - so `isDown` is not "a finger is on
  // it", it is "the device is now in this state". Every handler must SET from
  // it rather than flip a copy of its own.
  const dev = () => createDeviceMap(map);

  it('marks all thirty-two of them in the map', () => {
    const latching = map.controls.filter((c) => c.type === 'note' && c.behavior === 'toggle');
    expect(latching).toHaveLength(32);
    // The four bound today, and the rows the hardware was checked against.
    const names = latching.map((c) => c.name);
    for (const name of [
      'apc40.trackctl.pan',
      'apc40.trackctl.send_a',
      'apc40.trackctl.send_b',
      'apc40.trackctl.send_c',
      'apc40.device.clip_track',
      'apc40.track1.activator',
      'apc40.track1.solo_cue',
      'apc40.track1.record_arm',
    ]) {
      expect(names).toContain(name);
    }
  });

  it('reports the state the device is announcing, not a keypress', () => {
    const d = dev();
    const on = d.resolve(msg(NOTE_ON, 0, 90, 1));
    const off = d.resolve(msg(NOTE_ON, 0, 90, 0));
    expect(on.name).toBe('apc40.trackctl.send_c');
    expect(on.behavior).toBe('toggle');
    expect(on.isDown).toBe(true);
    // Velocity 0 is the second PRESS, not a release of the first.
    expect(off.isDown).toBe(false);
    // A real note-off decodes the same way, so a handler need not tell them apart.
    expect(d.resolve(msg(NOTE_OFF, 0, 90, 0)).isDown).toBe(false);
  });
});
