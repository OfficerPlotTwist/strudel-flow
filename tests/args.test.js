import { describe, expect, it } from 'vitest';
import {
  argRows,
  assignArgSlots,
  findNumericArgs,
  formatArgValue,
  knobToValue,
  maskCode,
  rangeFor,
  slotLabel,
  valueToKnob,
} from '../src/args.js';
import { createArgKnobs, deviceKnobIndex } from '../src/arg-knobs.js';

const KICK = `const kick = s("bd ~ ~ bd*4")
  .bank("RolandTR909")
  .gain(1.2)
  .shape(0.55)          // the record is clipped
  .lpf(260)`;

describe('maskCode', () => {
  it('blanks strings and comments without moving any offset', () => {
    const masked = maskCode(KICK);
    expect(masked).toHaveLength(KICK.length);
    expect(masked.split('\n')).toHaveLength(KICK.split('\n').length);
    expect(masked).not.toContain('bd');
    expect(masked).toContain('.gain(1.2)');
  });
});

describe('findNumericArgs', () => {
  const args = findNumericArgs(KICK);

  it('finds the settings and nothing else', () => {
    expect(args.map((a) => `${a.fn}=${a.value}`)).toEqual(['gain=1.2', 'shape=0.55', 'lpf=260']);
  });

  it('reports offsets that slice the literal back out of the source', () => {
    for (const arg of args) expect(KICK.slice(arg.from, arg.to)).toBe(arg.text);
  });

  it('rebases offsets onto the document the block came from', () => {
    const doc = `header\n\n${KICK}`;
    const offset = doc.indexOf('const kick');
    for (const arg of findNumericArgs(KICK, offset)) {
      expect(doc.slice(arg.from, arg.to)).toBe(arg.text);
    }
  });

  it('skips pattern, bank and sound-definition functions', () => {
    const code = 'n("0 2 4").scale("d2:phrygian").s("sawtooth").add(note(-12)).gain(0.5)';
    expect(findNumericArgs(code).map((a) => a.fn)).toEqual(['gain']);
  });

  it('never offers to replace a pattern with a constant', () => {
    const code = '.lpf(perlin.range(220, 780)).pan(sine.range(0.4, 0.6)).room(0.3)';
    const found = findNumericArgs(code).map((a) => a.fn);
    // The guarantee: lpf and pan are DRIVEN, and a knob writing a constant
    // over either would delete the movement rather than adjust it.
    expect(found).not.toContain('lpf');
    expect(found).not.toContain('pan');
    // The sweep's own endpoints are fair game - turning those keeps the
    // movement and changes how far it goes.
    expect(found).toEqual(['range', 'range', 'range', 'range', 'room']);
  });

  it('gives each argument of a multi-argument call its own slot', () => {
    const args = findNumericArgs('.adsr(0.01, 0.1, 0.6, 0.2)');
    expect(args.map((a) => a.position)).toEqual([0, 1, 2, 3]);
    expect(args.map((a) => a.value)).toEqual([0.01, 0.1, 0.6, 0.2]);
    // Sustain is a level; the other three are times, and must not share its range.
    expect(rangeFor('adsr', 0.6, 2)).toMatchObject({ min: 0, max: 1 });
    expect(rangeFor('adsr', 0.2, 3)).toMatchObject({ min: 0, max: 8 });
  });

  it('falls back for an argument position the table does not describe', () => {
    // Reusing the last declared range here would be a confident claim about a
    // parameter nobody wrote down.
    const range = rangeFor('adsr', 3, 9);
    expect(range.min).toBeLessThanOrEqual(3);
    expect(range.max).toBeGreaterThanOrEqual(3);
  });

  it('skips numbers inside comments and mini-notation', () => {
    expect(findNumericArgs('// .gain(0.9)\ns("bd*16")')).toEqual([]);
  });

  it('never binds a control that rebuilds the reverb when it moves', () => {
    // Not a taste call: Strudel's docs say these recalculate the impulse
    // response on change, and a knob sends ~200 values a second.
    const code = '.room(0.4).roomsize(4).size(2).roomdim(800).roomfade(1.2).roomlp(6000)';
    expect(findNumericArgs(code).map((a) => a.fn)).toEqual(['room']);
  });

  it('reads a whole identifier rather than its tail', () => {
    // `myGain` is the function, not `gain` - so it must not inherit gain's
    // 0..2 range. An undocumented call is still knobbable, on a fallback
    // range built from the value it already holds.
    const [arg] = findNumericArgs('myGain(2)');
    expect(arg.fn).toBe('myGain');
    expect(rangeFor(arg.fn, arg.value)).not.toMatchObject({ max: 2, log: false, integer: false });
  });

  it('never knobs an excluded function reached through a longer name', () => {
    // `.notes(...)` is not `note`, and `.sub(2)` is not `s`.
    expect(findNumericArgs('.notes(3).sub(2)').map((a) => a.fn)).toEqual(['notes', 'sub']);
  });
});

describe('assignArgSlots', () => {
  it('deals eight arguments per track, track1 through master', () => {
    const args = Array.from({ length: 74 }, (_, i) => ({
      fn: 'gain', value: 1, text: '1', from: i, to: i + 1, line: i, col: 0,
    }));
    const slots = assignArgSlots(args);
    // 9 tracks x 8 knobs; the 73rd argument gets no address rather than
    // sharing a knob with the first.
    expect(slots).toHaveLength(72);
    expect(slotLabel(slots[0])).toBe('1:1');
    expect(slotLabel(slots[7])).toBe('1:8');
    expect(slotLabel(slots[8])).toBe('2:1');
    // The master track prints as `m` - a display spelling, so that the one
    // word among eight rows of digits stops shoving its neighbours off the
    // columns they point at. The slot still carries the track's real name.
    expect(slotLabel(slots[71])).toBe('m:8');
    expect(slots[71].track).toBe('master');
  });

  it('gives each slot the CC and channel its address means on the wire', () => {
    const slots = assignArgSlots(findNumericArgs(KICK));
    expect(slots.map((s) => [s.channel, s.cc])).toEqual([[0, 16], [0, 17], [0, 18]]);
  });
});

describe('ranges', () => {
  it('uses the declared musical range, not the function domain', () => {
    expect(rangeFor('lpf', 260)).toMatchObject({ min: 20, max: 8000, log: true });
    expect(rangeFor('gain', 1.2)).toMatchObject({ min: 0, max: 2 });
  });

  it('falls back to a range that contains the value already in the source', () => {
    for (const value of [0.55, 7, 260]) {
      const range = rangeFor('somethingUndocumented', value);
      expect(value).toBeGreaterThanOrEqual(range.min);
      expect(value).toBeLessThanOrEqual(range.max);
    }
  });

  it('round-trips a value through the knob it would park on', () => {
    for (const [fn, value] of [['lpf', 260], ['gain', 1.2], ['shape', 0.55], ['crush', 9]]) {
      const range = rangeFor(fn, value);
      const back = knobToValue(range, valueToKnob(range, value));
      expect(Math.abs(back - value)).toBeLessThan(Math.abs(value) * 0.05 + 0.02);
    }
  });

  it('sweeps a log range evenly across octaves', () => {
    const range = rangeFor('lpf', 260);
    // The midpoint of the travel is the geometric mean, not the arithmetic one.
    expect(knobToValue(range, 63.5)).toBeCloseTo(Math.sqrt(20 * 8000), 0);
  });

  it('keeps counting parameters whole', () => {
    const range = rangeFor('crush', 9);
    expect(Number.isInteger(knobToValue(range, 40))).toBe(true);
    expect(formatArgValue(range, 8.6)).toBe('9');
  });

  it('writes enough decimals to tell the knob steps apart', () => {
    expect(formatArgValue(rangeFor('delaytime', 0.375), 0.375)).toBe('0.375');
    expect(formatArgValue(rangeFor('lpf', 260), 260.04)).toBe('260');
  });
});

describe('argRows', () => {
  it('puts each label under the column of its own argument', () => {
    const slots = assignArgSlots(findNumericArgs(KICK));
    const rows = argRows(slots, KICK.split('\n').length);
    const lines = KICK.split('\n');
    expect(rows).toHaveLength(lines.length);
    // Line 0 is `const kick = s(...)` - no settings on it, so a blank spacer.
    expect(rows[0]).toBe('');
    for (const slot of slots) {
      expect(rows[slot.line].indexOf(slotLabel(slot))).toBe(slot.col);
      expect(lines[slot.line].slice(slot.col, slot.col + slot.text.length)).toBe(slot.text);
    }
  });

  it('pushes a colliding label right instead of overlapping it', () => {
    const code = '.attack(0.002).decay(0.09)';
    const slots = assignArgSlots(findNumericArgs(code));
    const row = argRows(slots, 1)[0];
    expect(row).toContain('1:1');
    expect(row).toContain('1:2');
    // The first keeps its true column; the second is only shifted enough to fit.
    expect(row.indexOf('1:1')).toBe(slots[0].col);
    expect(row.indexOf('1:2')).toBeGreaterThan(slots[0].col + 2);
  });
});

describe('createArgKnobs', () => {
  const slotsFor = (code) => assignArgSlots(findNumericArgs(code));

  it('names only the device knobs', () => {
    expect(deviceKnobIndex('apc40.device.knob3')).toBe(3);
    expect(deviceKnobIndex('apc40.trackctl.knob3')).toBeNull();
    expect(deviceKnobIndex(undefined)).toBeNull();
  });

  it('parks every knob on the value already in the source', () => {
    const sent = [];
    const knobs = createArgKnobs({ send: (channel, cc, value) => sent.push([channel, cc, value]) });
    const slots = slotsFor(KICK);
    knobs.prime(slots);
    expect(sent.map((s) => s.slice(0, 2))).toEqual([[0, 16], [0, 17], [0, 18]]);
    expect(sent[0][2]).toBe(valueToKnob(slots[0].range, 1.2));
  });

  it('rewrites the argument the turned knob addresses', () => {
    const applied = [];
    const knobs = createArgKnobs({ send: () => {}, apply: (slot, value, text) => applied.push([slot.fn, text]) });
    knobs.prime(slotsFor(KICK));
    // Device knobs are track-scoped: the channel arrives as `track`.
    expect(knobs.feed({ name: 'apc40.device.knob2', track: '1', value: 0.25 })).toBe(true);
    expect(applied).toHaveLength(1);
    expect(applied[0][0]).toBe('shape');
  });

  it('ignores the value burst a track select re-transmits', () => {
    const applied = [];
    const knobs = createArgKnobs({ send: () => {}, apply: () => applied.push(1) });
    const slots = slotsFor(KICK);
    knobs.prime(slots);
    // The APC40 re-sends the counters we just wrote. Same reading, not a turn.
    for (const slot of slots) {
      knobs.feed({
        name: `apc40.device.knob${slot.knob}`,
        track: slot.track,
        value: valueToKnob(slot.range, slot.value) / 127,
      });
    }
    expect(applied).toHaveLength(0);
  });

  it('leaves a knob with no argument behind it alone', () => {
    const knobs = createArgKnobs({ send: () => {}, apply: () => {} });
    knobs.prime(slotsFor(KICK)); // three arguments, so knobs 4-8 are unbound
    expect(knobs.feed({ name: 'apc40.device.knob7', track: '1', value: 0.5 })).toBe(false);
    expect(knobs.feed({ name: 'apc40.device.knob1', track: '5', value: 0.5 })).toBe(false);
  });

  it('drops every binding when nothing is addressed', () => {
    const knobs = createArgKnobs({ send: () => {}, apply: () => {} });
    knobs.prime(slotsFor(KICK));
    knobs.clear();
    expect(knobs.feed({ name: 'apc40.device.knob1', track: '1', value: 0.5 })).toBe(false);
  });
});
