import { describe, expect, it } from 'vitest';
import {
  addToBlock,
  alternateWith,
  chainOnto,
  classifyItem,
  headCall,
  setupLine,
  splitChain,
} from '../src/build.js';

describe('classifyItem', () => {
  it('separates the three things a pick can be', () => {
    expect(classifyItem('s("bd")')).toBe('pattern');
    expect(classifyItem('.gain(0.5)')).toBe('fragment');
    expect(classifyItem('setcpm(120/4)')).toBe('setup');
    expect(classifyItem('samples("github:x/y")')).toBe('setup');
    expect(classifyItem('   ')).toBe('empty');
  });
});

describe('headCall', () => {
  it('reads a call whose whole argument is one mini-notation string', () => {
    expect(headCall('s("bd*4")')).toEqual({ label: '', fn: 's', arg: 'bd*4' });
    expect(headCall('$: n("0 2 4")')).toEqual({ label: '$: ', fn: 'n', arg: '0 2 4' });
  });

  it('refuses anything that is not just a head', () => {
    // Nothing to put brackets around, and not only a head.
    expect(headCall('n(0)')).toBeNull();
    expect(headCall('s("bd").gain(1)')).toBeNull();
    expect(headCall('  .room(0.5)')).toBeNull();
  });
});

describe('alternateWith', () => {
  it('folds a second sound into angle brackets', () => {
    expect(alternateWith('s("bd")', 's("sd")')).toBe('s("<bd sd>")');
  });

  it('keeps adding to an existing alternation rather than nesting it', () => {
    expect(alternateWith('s("<bd sd>")', 's("hh")')).toBe('s("<bd sd hh>")');
  });

  it('treats a group as one alternative', () => {
    expect(alternateWith('s("<bd [sd sd]>")', 's("hh")')).toBe('s("<bd [sd sd] hh>")');
  });

  it('carries the chain through, once', () => {
    const a = 's("bd")\n  .bank("RolandTR909")\n  .gain(0.9)';
    const b = 's("sd")\n  .bank("RolandTR909")\n  .gain(0.9)';
    expect(alternateWith(a, b)).toBe('s("<bd sd>")\n  .bank("RolandTR909")\n  .gain(0.9)');
  });

  it('refuses two different functions', () => {
    // A drum and a melody are two parts; merged, each would fall silent on
    // alternate cycles.
    expect(alternateWith('s("bd")', 'n("0 2")')).toBeNull();
  });

  it('refuses two different chains', () => {
    expect(alternateWith('s("bd")\n  .gain(1)', 's("sd")\n  .gain(0.2)')).toBeNull();
  });

  it('keeps a labelled statement labelled', () => {
    expect(alternateWith('$: s("bd")', '$: s("sd")')).toBe('$: s("<bd sd>")');
  });
});

describe('chainOnto', () => {
  it('hangs a fragment off the last real line', () => {
    expect(chainOnto('s("bd")\n  .gain(1)', '.room(0.3)')).toBe('s("bd")\n  .gain(1).room(0.3)');
  });

  it('steps over trailing comments and blank lines', () => {
    expect(chainOnto('s("bd")\n  .gain(1)\n// note\n', '.room(0.3)')).toBe(
      's("bd")\n  .gain(1).room(0.3)\n// note\n',
    );
  });
});

describe('addToBlock', () => {
  it('alternates a matching pattern', () => {
    expect(addToBlock('s("bd")', 's("sd")')).toEqual({ text: 's("<bd sd>")', separate: false });
  });

  it('chains a fragment', () => {
    expect(addToBlock('s("bd")', '.crush(4)')).toEqual({
      text: 's("bd").crush(4)',
      separate: false,
    });
  });

  it('reports a pick that cannot join as its own block', () => {
    expect(addToBlock('s("bd")', 'n("0 2 4")')).toEqual({ text: 'n("0 2 4")', separate: true });
  });

  it('leaves the block alone for an empty pick', () => {
    expect(addToBlock('s("bd")', '  ')).toEqual({ text: 's("bd")', separate: false });
  });
});

describe('setupLine', () => {
  it('puts a setup statement above the first thing that plays', () => {
    expect(setupLine(['setcpm(120/4)', '', '$: s("bd")'])).toBe(1);
  });

  it('lands under a leading comment rather than above it', () => {
    expect(setupLine(['// title', '', '$: s("bd")'])).toBe(0);
  });

  it('goes to the top of a document that has no setup yet', () => {
    expect(setupLine(['$: s("bd")'])).toBe(0);
  });

  it('stacks after the setup already there', () => {
    expect(setupLine(['setcpm(120/4)', 'samples("a")', '', '$: s("bd")'])).toBe(2);
  });
});

describe('a fragment with nothing to chain onto', () => {
  it('is refused rather than appended inside a comment', () => {
    // It used to land after the `//`, where it parsed, never ran, and was gone
    // with no error and no change in sound.
    expect(chainOnto('// just a header', '.gain(0.5)')).toBeNull();
    expect(addToBlock('// just a header', '.gain(0.5)')).toEqual({
      text: '// just a header',
      separate: false,
      refused: true,
    });
  });

  it('still chains past a TRAILING comment onto real code above it', () => {
    expect(chainOnto('s("bd")\n// note', '.gain(0.5)')).toBe('s("bd").gain(0.5)\n// note');
  });
});
