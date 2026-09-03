import { describe as suite, expect, it } from 'vitest';
import {
  describe as describeFn,
  functionAt,
  scanFunctions,
  signatureOf,
  uniqueFunctions,
} from '../src/explain.js';

// A tiny stand-in for strudel-docs.json so these tests describe OUR scanning
// rules and never fail because upstream reworded a docstring.
const lookup = {
  s: { description: 'Select a sound.', params: ['sound'], package: 'core' },
  fast: { description: 'Speed up a pattern.', params: ['factor'], package: 'core' },
  seg: { description: '', params: [], package: 'core', aliasOf: 'segment' },
  segment: { description: 'Sample n events per cycle.', params: ['segments'], package: 'core' },
};

suite('scanFunctions', () => {
  it('finds functions in source order', () => {
    expect(scanFunctions('s("bd").fast(2)', lookup).map((h) => h.name)).toEqual(['s', 'fast']);
  });

  it('ignores mini-notation words inside strings', () => {
    // "fast" here is a sample name, not a call - a naive identifier scan
    // would report it and the explainer would describe the wrong thing.
    expect(scanFunctions('s("fast s seg")', lookup)).toEqual([
      { name: 's', from: 0, to: 1 },
    ]);
  });

  it('ignores commented-out code', () => {
    expect(scanFunctions('// s("bd").fast(2)\nsegment(4)', lookup).map((h) => h.name)).toEqual([
      'segment',
    ]);
    expect(scanFunctions('/* fast */ s("bd")', lookup).map((h) => h.name)).toEqual(['s']);
  });

  it('reports each occurrence, and uniqueFunctions collapses them', () => {
    const code = 'fast(2).fast(3)';
    expect(scanFunctions(code, lookup)).toHaveLength(2);
    expect(uniqueFunctions(code, lookup).map((h) => h.name)).toEqual(['fast']);
  });
});

suite('functionAt', () => {
  const code = 's("bd").fast(2)';

  it('matches a cursor sitting inside the name', () => {
    expect(functionAt(code, 9, lookup).name).toBe('fast');
  });

  it('matches a cursor in the argument list of the call to its left', () => {
    expect(functionAt(code, code.indexOf('2'), lookup).name).toBe('fast');
  });

  it('returns null before the first function', () => {
    expect(functionAt('   s("bd")', 1, lookup)).toBe(null);
  });
});

suite('describe', () => {
  it('resolves an alias to its canonical entry but keeps the written name', () => {
    const info = describeFn('seg', lookup);
    expect(info).toMatchObject({
      name: 'seg',
      canonical: 'segment',
      isAlias: true,
      description: 'Sample n events per cycle.',
    });
    expect(signatureOf(info)).toBe('seg(segments)');
  });

  it('returns null for an unknown name', () => {
    expect(describeFn('nope', lookup)).toBe(null);
  });
});
