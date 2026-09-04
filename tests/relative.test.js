import { describe, expect, it } from 'vitest';
import { DEFAULTS, createRelativeBank, stepRelative } from '../src/relative.js';

describe('stepRelative', () => {
  const opts = { center: 64, guard: 12, scale: 1 };

  it('reports movement, not position', () => {
    // The whole point: an absolute knob says where it is, and this turns that
    // into how far it moved.
    expect(stepRelative(64, 67, opts)).toEqual({ delta: 3, recenter: false, last: 67 });
    expect(stepRelative(67, 64, opts)).toEqual({ delta: -3, recenter: false, last: 64 });
  });

  it('reports nothing for a repeated value', () => {
    expect(stepRelative(64, 64, opts)).toEqual({ delta: 0, recenter: false, last: 64 });
  });

  it('re-centres near a rail, not on every message', () => {
    // A fast turn emits up to 200 messages a second; writing back on each one
    // would race the physical movement. The guard makes it roughly once per
    // half-rotation.
    expect(stepRelative(64, 80, opts).recenter).toBe(false);
    expect(stepRelative(100, 116, opts).recenter).toBe(true); // within 12 of 127
    expect(stepRelative(30, 11, opts).recenter).toBe(true); // within 12 of 0
  });

  it('reports the delta it earned before re-centring', () => {
    // The move that crossed into the guard band is still a real movement; it
    // must be emitted, not swallowed by the write that follows it.
    const step = stepRelative(110, 120, opts);
    expect(step.delta).toBe(10);
    expect(step.recenter).toBe(true);
    expect(step.last).toBe(64); // parked, ready for the next turn
  });

  it('scales the delta without changing resolution', () => {
    expect(stepRelative(64, 65, { ...opts, scale: 4 }).delta).toBe(4);
    expect(stepRelative(64, 68, { ...opts, scale: 0.25 }).delta).toBe(1);
  });

  it('rounds a scaled delta to whole steps', () => {
    // Callers count list positions with these; a third of an item is nothing.
    expect(stepRelative(64, 65, { ...opts, scale: 0.25 }).delta).toBe(0);
    expect(Number.isInteger(stepRelative(64, 67, { ...opts, scale: 0.5 }).delta)).toBe(true);
  });
});

describe('createRelativeBank', () => {
  const knobControl = (name, value) => ({ name, type: 'cc', number: 54, channel: 0, value: value / 127 });

  it('parks every managed knob on start', () => {
    const sent = [];
    createRelativeBank({
      knobs: ['apc40.trackctl.knob7', 'apc40.trackctl.knob8'],
      send: (name, value) => sent.push([name, value]),
    }).park();
    expect(sent).toEqual([
      ['apc40.trackctl.knob7', DEFAULTS.center],
      ['apc40.trackctl.knob8', DEFAULTS.center],
    ]);
  });

  it('ignores controls it does not manage', () => {
    const bank = createRelativeBank({ knobs: ['apc40.trackctl.knob7'], send: () => {} });
    expect(bank.feed(knobControl('apc40.trackctl.knob1', 70))).toBe(null);
    expect(bank.feed({ name: 'apc40.global.play', isDown: true })).toBe(null);
  });

  it('turns an absolute knob into signed deltas', () => {
    const bank = createRelativeBank({ knobs: ['apc40.trackctl.knob7'], send: () => {} });
    bank.park();
    expect(bank.feed(knobControl('apc40.trackctl.knob7', 66))).toEqual({
      name: 'apc40.trackctl.knob7',
      delta: 2,
    });
    expect(bank.feed(knobControl('apc40.trackctl.knob7', 64))).toEqual({
      name: 'apc40.trackctl.knob7',
      delta: -2,
    });
  });

  it('writes the centre back when a knob nears a rail', () => {
    const sent = [];
    const bank = createRelativeBank({
      knobs: ['apc40.trackctl.knob7'],
      send: (name, value) => sent.push([name, value]),
    });
    bank.park();
    sent.length = 0;
    bank.feed(knobControl('apc40.trackctl.knob7', 120));
    expect(sent).toEqual([['apc40.trackctl.knob7', 64]]);
    // Parked, so the next turn measures from the centre rather than from 120.
    expect(bank.feed(knobControl('apc40.trackctl.knob7', 66)).delta).toBe(2);
  });

  it('keeps each knob on its own count', () => {
    const bank = createRelativeBank({
      knobs: ['apc40.trackctl.knob7', 'apc40.trackctl.knob8'],
      send: () => {},
    });
    bank.park();
    bank.feed(knobControl('apc40.trackctl.knob7', 70));
    expect(bank.feed(knobControl('apc40.trackctl.knob8', 66)).delta).toBe(2);
  });
});
