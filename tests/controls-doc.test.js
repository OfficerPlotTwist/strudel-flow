import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KEYBOARD, SURFACE, documentedControls } from '../src/controls-doc.js';
import { defaultTriggerMap } from '../src/triggers.js';
import { createDeviceMap } from '../src/device-map.js';

const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

/**
 * Control names main.js actually reacts to.
 *
 * Read out of the source rather than listed here, because a list would drift
 * in exactly the way this test exists to prevent.
 */
function referencedControls() {
  const names = new Set(mainSource.match(/apc40\.[a-z0-9_.]+/g) ?? []);
  // The clip grid is matched by pattern, not by name - `apc40.track3.clip1`
  // appears only as an example inside a regex - so every row of it is
  // represented by its track-1 name.
  for (const name of [...names]) {
    if (/^apc40\.track[1-8]\.clip[1-5]$/.test(name)) {
      names.delete(name);
      names.add(name.replace(/track[1-8]/, 'track1'));
    }
    // The device knobs are matched by deviceKnobIndex(), likewise.
    if (/^apc40\.device\.knob[1-8]$/.test(name)) {
      names.delete(name);
      names.add('apc40.device.knob1');
    }
  }
  return names;
}

describe('the controls sheet stays true', () => {
  const documented = new Set(documentedControls());

  it('documents every control the app reacts to', () => {
    const missing = [...referencedControls()].filter((name) => !documented.has(name));
    expect(missing).toEqual([]);
  });

  it('documents no control this surface does not have', () => {
    const device = createDeviceMap();
    const real = new Set(device.names());
    // The clip grid and the device knobs are documented by their row, using
    // the track-1 name, which is a real control.
    const invented = [...documented].filter((name) => !real.has(name));
    expect(invented).toEqual([]);
  });

  it('documents every keyboard trigger the app binds', () => {
    const bound = Object.keys(defaultTriggerMap())
      .filter((t) => t.startsWith('key:'))
      .map((t) => t.slice(4));
    const text = KEYBOARD.flatMap((g) => g.rows.map((r) => r[0])).join(' | ');
    // Ctrl+PageUp and Ctrl+PageDown share one row, as do the F-key ranges, so
    // match on the distinguishing part rather than the whole trigger.
    const missing = bound.filter((key) => !text.includes(key.replace(/^Ctrl\+/, '')));
    expect(missing).toEqual([]);
  });

  it('says what has to be true for each surface row to apply', () => {
    // This surface re-scopes controls rather than adding them, so a control
    // that appears twice MUST distinguish itself - a sheet listing REC once
    // would be wrong half the time.
    const seen = new Map();
    for (const section of SURFACE) {
      for (const [name, , , mode] of section.rows) {
        if (!seen.has(name)) seen.set(name, []);
        seen.get(name).push(mode);
      }
    }
    for (const [name, modes] of seen) {
      if (modes.length < 2) continue;
      expect(new Set(modes).size, `${name} is listed ${modes.length}x with modes ${JSON.stringify(modes)}`)
        .toBe(modes.length);
    }
  });

  it('gives every row a label and a description', () => {
    for (const section of SURFACE) {
      for (const row of section.rows) {
        expect(row[1], `${row[0]} label`).toBeTruthy();
        expect(row[2], `${row[0]} description`).toBeTruthy();
      }
    }
    for (const group of KEYBOARD) {
      for (const [key, does] of group.rows) {
        expect(key).toBeTruthy();
        expect(does).toBeTruthy();
      }
    }
  });
});
