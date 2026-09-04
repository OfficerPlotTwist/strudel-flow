import { describe, expect, it } from 'vitest';
import { HUES, functionColor } from '../src/palette.js';

describe('functionColor', () => {
  it('gives one function the same colour every time', () => {
    // The whole point is that the explainer and the editor agree without
    // passing a colour between them - both just ask for the name.
    expect(functionColor('fast')).toBe(functionColor('fast'));
  });

  it('gives different functions different hues, mostly', () => {
    const hues = new Set(['fast', 'slow', 'room', 'gain', 'note', 's'].map((n) => functionColor(n)));
    expect(hues.size).toBeGreaterThan(3);
  });

  it('dims without changing hue', () => {
    // "darker same colour" - an inactive block must read as the same function,
    // just quieter. A different hue would say it was a different function.
    const live = functionColor('fast', true);
    const dim = functionColor('fast', false);
    expect(live).not.toBe(dim);
    expect(live.match(/hsl\((\d+)/)[1]).toBe(dim.match(/hsl\((\d+)/)[1]);
  });

  it('stays inside the CRT register', () => {
    // Every hue is a phosphor, not a rainbow: the palette is deliberately
    // narrow so the editor still reads as one screen rather than as syntax
    // highlighting from another application.
    for (const hue of HUES) {
      expect(hue).toBeGreaterThanOrEqual(90);
      expect(hue).toBeLessThanOrEqual(210);
    }
  });

  it('is defined for a name it has never seen', () => {
    expect(functionColor('someFunctionNobodyWrote')).toMatch(/^hsl\(/);
  });
});
