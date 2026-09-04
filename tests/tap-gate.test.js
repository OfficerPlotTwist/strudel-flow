import { describe, expect, it } from 'vitest';
import { createTapGate } from '../src/triggers.js';

describe('createTapGate', () => {
  it('fires on the third tap in a row', () => {
    const gate = createTapGate({ taps: 3, windowMs: 600 });
    expect(gate.tap(0)).toBe(false);
    expect(gate.tap(200)).toBe(false);
    expect(gate.tap(400)).toBe(true);
  });

  it('never fires when the taps are too far apart', () => {
    // A button pressed once a second is someone using it, not someone asking
    // to delete anything.
    const gate = createTapGate({ taps: 3, windowMs: 600 });
    expect([gate.tap(0), gate.tap(1000), gate.tap(2000), gate.tap(3000)]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('measures the gap between taps, not the whole gesture', () => {
    // Three unhurried but connected taps still count; the window is per gap.
    const gate = createTapGate({ taps: 3, windowMs: 600 });
    expect(gate.tap(0)).toBe(false);
    expect(gate.tap(500)).toBe(false);
    expect(gate.tap(1000)).toBe(true);
  });

  it('starts a new run after firing', () => {
    const gate = createTapGate({ taps: 3, windowMs: 600 });
    gate.tap(0);
    gate.tap(100);
    expect(gate.tap(200)).toBe(true);
    expect(gate.tap(300)).toBe(false);
    expect(gate.tap(400)).toBe(false);
    expect(gate.tap(500)).toBe(true);
  });

  it('restarts the count after a long pause', () => {
    const gate = createTapGate({ taps: 3, windowMs: 600 });
    gate.tap(0);
    gate.tap(100);
    expect(gate.tap(5000)).toBe(false); // the pause reset it to one
    expect(gate.tap(5100)).toBe(false);
    expect(gate.tap(5200)).toBe(true);
  });

  it('reports how far into the gesture it is', () => {
    const gate = createTapGate({ taps: 3, windowMs: 600 });
    gate.tap(0);
    expect(gate.pending()).toBe(1);
    gate.tap(100);
    expect(gate.pending()).toBe(2);
  });
});

describe('reset', () => {
  it('abandons a half-finished gesture', () => {
    // The SCENE 3 gate is shared across pattern-build sessions. Without a
    // reset, one press in the first session made the first press of the next
    // count as a double-tap - blanking a segment instead of duplicating it.
    const gate = createTapGate({ taps: 2, windowMs: 400 });
    expect(gate.tap(1000)).toBe(false);
    gate.reset();
    expect(gate.tap(1150)).toBe(false);
    expect(gate.tap(1250)).toBe(true);
  });

  it('clears the progress readout too', () => {
    const gate = createTapGate({ taps: 3, windowMs: 600 });
    gate.tap(1000);
    gate.tap(1100);
    expect(gate.pending()).toBe(2);
    gate.reset();
    expect(gate.pending()).toBe(0);
  });
});
