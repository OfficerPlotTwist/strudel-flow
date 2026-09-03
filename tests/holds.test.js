import { describe, expect, it } from 'vitest';
import {
  HOLD_SLOTS,
  defaultHoldSlots,
  resolveHold,
  setHoldBlock,
  setHoldTrigger,
} from '../src/triggers.js';

describe('defaultHoldSlots', () => {
  it('gives five slots on F1-F5, one per leading block', () => {
    expect(defaultHoldSlots()).toHaveLength(HOLD_SLOTS);
    expect(defaultHoldSlots()[0]).toEqual({ trigger: 'key:F1', blockIndex: 0 });
    expect(defaultHoldSlots()[4]).toEqual({ trigger: 'key:F5', blockIndex: 4 });
  });
});

describe('resolveHold', () => {
  const slots = defaultHoldSlots();

  it('maps a bound trigger to its block index', () => {
    expect(resolveHold(slots, 'key:F3')).toBe(2);
  });

  it('returns null for an unbound trigger', () => {
    expect(resolveHold(slots, 'key:F9')).toBe(null);
  });

  it('returns null rather than 0 for a slot with no key', () => {
    expect(resolveHold(setHoldTrigger(slots, 0, null), null)).toBe(null);
  });
});

describe('setHoldTrigger', () => {
  it('rebinds one slot', () => {
    const next = setHoldTrigger(defaultHoldSlots(), 1, 'key:q');
    expect(resolveHold(next, 'key:q')).toBe(1);
    expect(resolveHold(next, 'key:F2')).toBe(null);
  });

  it('steals the key from whichever slot already had it', () => {
    // Otherwise one keypress would unmute two different blocks.
    const next = setHoldTrigger(defaultHoldSlots(), 0, 'key:F4');
    expect(resolveHold(next, 'key:F4')).toBe(0);
    expect(next[3].trigger).toBe(null);
  });
});

describe('setHoldBlock', () => {
  it('retargets a slot at a different block without touching its key', () => {
    const next = setHoldBlock(defaultHoldSlots(), 0, 7);
    expect(next[0]).toEqual({ trigger: 'key:F1', blockIndex: 7 });
    expect(resolveHold(next, 'key:F1')).toBe(7);
  });
});
