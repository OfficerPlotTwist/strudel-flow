import { describe, expect, it } from 'vitest';
import {
  applyChain,
  chainMethods,
  defaultValues,
  formatValue,
  knobToValue,
  parseSlots,
  renderChain,
} from '../src/fx.js';

describe('parseSlots', () => {
  it('reads label, default and range', () => {
    expect(parseSlots('.lpf(<cut 900: 20..8000 log>)')).toEqual([
      { label: 'cut', default: 900, min: 20, max: 8000, log: true },
    ]);
  });

  it('reads several slots in source order', () => {
    const slots = parseSlots('.room(<size .4: 0..1>).lpf(<cut 900: 20..8000 log>)');
    expect(slots.map((s) => s.label)).toEqual(['size', 'cut']);
    expect(slots[0].log).toBe(false);
  });

  it('accepts negative ranges', () => {
    expect(parseSlots('.rot(<steps 1: -4..4>)')[0]).toMatchObject({ min: -4, max: 4 });
  });

  it('finds nothing in a chain with no slots', () => {
    expect(parseSlots('.jux(rev)')).toEqual([]);
  });
});

describe('knobToValue', () => {
  const linear = { min: 0, max: 1, log: false };
  const log = { min: 20, max: 8000, log: true };

  it('maps the pot ends onto the range ends', () => {
    expect(knobToValue(linear, 0)).toBe(0);
    expect(knobToValue(linear, 127)).toBe(1);
    expect(knobToValue(log, 0)).toBeCloseTo(20);
    expect(knobToValue(log, 127)).toBeCloseTo(8000);
  });

  it('puts a log range midpoint at the geometric mean, not the arithmetic one', () => {
    // The whole point: 400Hz is the musical middle of 20..8000, not 4010Hz.
    expect(knobToValue(log, 64)).toBeGreaterThan(300);
    expect(knobToValue(log, 64)).toBeLessThan(500);
  });

  it('clamps a reading outside 0-127 rather than running off the range', () => {
    expect(knobToValue(linear, 999)).toBe(1);
    expect(knobToValue(linear, -5)).toBe(0);
  });

  it('falls back to linear for a log range that touches zero', () => {
    // log(0) is -Infinity; a NaN cutoff would be silently written into a song.
    const bad = { min: 0, max: 1, log: true };
    expect(knobToValue(bad, 64)).toBeCloseTo(0.504, 2);
  });
});

describe('formatValue', () => {
  it('rounds an all-integer slot to a whole number', () => {
    expect(formatValue({ min: 20, max: 8000, default: 900 }, 1873.4429)).toBe('1873');
    // The reason this rule exists: .unison(3.47) and .octave(2.7) are not
    // parameters anyone meant, and their ranges are narrow.
    expect(formatValue({ min: 1, max: 7, default: 1 }, 3.47)).toBe('3');
    expect(formatValue({ min: 1, max: 16, default: 8 }, 7.32)).toBe('7');
  });

  it('keeps three decimals on a sub-unit range', () => {
    // .delaytime(0.375) is a dotted eighth; .delaytime(0.38) is a mistake.
    expect(formatValue({ min: 0.02, max: 1, default: 0.375 }, 0.375)).toBe('0.375');
  });

  it('trims trailing zeros', () => {
    expect(formatValue({ min: 0, max: 1, default: 0.4 }, 0.5)).toBe('0.5');
  });

  it('renders zero as 0, not an empty string', () => {
    expect(formatValue({ min: 0, max: 1, default: 0.4 }, 0)).toBe('0');
  });
});

describe('renderChain', () => {
  const template = '.room(<size .4: 0..1>).lpf(<cut 900: 20..8000 log>)';

  it('fills slots with the given values', () => {
    expect(renderChain(template, [0.6, 2000])).toBe('.room(0.6).lpf(2000)');
  });

  it('falls back to each slot default where no value was given', () => {
    expect(renderChain(template)).toBe('.room(0.4).lpf(900)');
    expect(defaultValues(template)).toEqual([0.4, 900]);
  });
});

describe('chainMethods', () => {
  it('lists the top-level calls', () => {
    expect(chainMethods('.room(0.4).lpf(900)')).toEqual(['room', 'lpf']);
  });

  it('ignores calls nested inside an argument', () => {
    // The lpf inside the jux belongs to the jux - reaching in and rewriting it
    // would destroy the very difference the jux exists to create.
    expect(chainMethods('.jux(x => x.lpf(400)).gain(0.8)')).toEqual(['jux', 'gain']);
  });
});

describe('applyChain', () => {
  it('appends a chain the block does not already have', () => {
    expect(applyChain(['$: s("bd sd")'], '.lpf(2000)')).toEqual(['$: s("bd sd").lpf(2000)']);
  });

  it('replaces a call the block already makes, instead of stacking a second one', () => {
    expect(applyChain(['$: s("bd").lpf(400).gain(.8)'], '.lpf(2000)')).toEqual([
      '$: s("bd").lpf(2000).gain(.8)',
    ]);
  });

  it('replaces what it can and appends what it cannot, in one pass', () => {
    expect(applyChain(['$: s("bd").lpf(400)'], '.lpf(2000).room(0.3)')).toEqual([
      '$: s("bd").lpf(2000).room(0.3)',
    ]);
  });

  it('is idempotent when re-approved with the same values', () => {
    const once = applyChain(['$: s("bd")'], '.lpf(2000)');
    expect(applyChain(once, '.lpf(2000)')).toEqual(once);
  });

  it('does not reach inside a jux to rewrite its inner call', () => {
    const lines = ['$: s("bd").jux(x => x.lpf(400))'];
    expect(applyChain(lines, '.lpf(2000)')).toEqual(['$: s("bd").jux(x => x.lpf(400)).lpf(2000)']);
  });

  it('matches a call whose argument contains parens', () => {
    const lines = ['$: s("bd").lpf(saw.range(200,2000))'];
    expect(applyChain(lines, '.lpf(900)')).toEqual(['$: s("bd").lpf(900)']);
  });

  it('appends to the last code line of a multi-line block', () => {
    expect(applyChain(['$: s("bd sd")', '  .fast(2)'], '.room(0.3)')).toEqual([
      '$: s("bd sd")',
      '  .fast(2).room(0.3)',
    ]);
  });

  it('lands inside a trailing semicolon rather than after it', () => {
    expect(applyChain(['$: s("bd");'], '.room(0.3)')).toEqual(['$: s("bd").room(0.3);']);
  });

  it('skips a trailing comment line when choosing where to append', () => {
    expect(applyChain(['$: s("bd")', '// the kick'], '.room(0.3)')).toEqual([
      '$: s("bd").room(0.3)',
      '// the kick',
    ]);
  });
});
