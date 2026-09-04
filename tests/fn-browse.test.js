import { describe, expect, it } from 'vitest';
import {
  blockFunctions,
  replaceKind,
  replacementFor,
  stepFunction,
  targetTab,
} from '../src/fn-browse.js';

const BLOCK = `$: s("bd sd")
  .bank("RolandTR909")
  .lpf(400)
  .room(0.3)`;

describe('targetTab', () => {
  it('sends a sample function to the sounds list', () => {
    expect(targetTab('s')).toBe('sounds');
  });

  it('sends a pattern function to the snippets list', () => {
    expect(targetTab('n')).toBe('snippets');
  });

  it('sends anything else to the function list', () => {
    expect(targetTab('lpf')).toBe('funcs');
    expect(targetTab('room')).toBe('funcs');
  });

  it('lands an unknown name somewhere sensible rather than nowhere', () => {
    expect(targetTab('nosuchfunction')).toBe('funcs');
  });
});

describe('replaceKind', () => {
  it('swaps the argument of a sound, and the name of an effect', () => {
    expect(replaceKind('s')).toBe('argument');
    expect(replaceKind('lpf')).toBe('function');
  });
});

describe('blockFunctions', () => {
  const fns = blockFunctions(BLOCK);

  it('lists the calls in source order', () => {
    expect(fns.map((f) => f.name)).toEqual(['s', 'bank', 'lpf', 'room']);
  });

  it('spans the name and the balanced argument', () => {
    const lpf = fns.find((f) => f.name === 'lpf');
    expect(BLOCK.slice(lpf.from, lpf.to)).toBe('lpf');
    expect(BLOCK.slice(lpf.argFrom, lpf.argTo)).toBe('400');
  });

  it('takes a nested call as one argument, not half of one', () => {
    const [fn] = blockFunctions('.lpf(saw.range(200, 2000))');
    expect(fn.arg).toBe('saw.range(200, 2000)');
  });

  it('skips names in comments and inside mini-notation', () => {
    // `sd` is a sample word, not a call, and a commented function is not running.
    expect(blockFunctions('// .gain(1)\ns("bd sd")').map((f) => f.name)).toEqual(['s']);
  });

  it('skips a bare name that is not called', () => {
    // `sine` in .pan(sine) has no argument to replace.
    expect(blockFunctions('.pan(sine)').map((f) => f.name)).toEqual(['pan']);
  });

  it('rebases onto the document the block came from', () => {
    const doc = `header\n\n${BLOCK}`;
    const at = doc.indexOf('$: s(');
    for (const fn of blockFunctions(BLOCK, at)) {
      expect(doc.slice(fn.from, fn.to)).toBe(fn.name);
    }
  });
});

describe('replacementFor', () => {
  const fns = blockFunctions(BLOCK);
  const s = fns.find((f) => f.name === 's');
  const lpf = fns.find((f) => f.name === 'lpf');

  it('swaps a sound into a sample call, keeping the call', () => {
    const edit = replacementFor(s, { kind: 'sounds', name: 'piano' });
    expect(edit).toEqual({ from: s.argFrom, to: s.argTo, text: '"piano"' });
    const out = BLOCK.slice(0, edit.from) + edit.text + BLOCK.slice(edit.to);
    expect(out).toContain('s("piano")');
  });

  it('swaps an effect name, keeping its argument', () => {
    // The 400 is a cutoff whichever filter reads it; dropping it would make a
    // swap into a reset.
    const edit = replacementFor(lpf, { kind: 'funcs', name: 'hpf' });
    const out = BLOCK.slice(0, edit.from) + edit.text + BLOCK.slice(edit.to);
    expect(out).toContain('.hpf(400)');
  });

  it('lifts the mini-notation out of a snippet pick', () => {
    const edit = replacementFor(s, { kind: 'snippets', name: 'x', code: '$: s("hh*8")\n  .gain(1)' });
    expect(edit.text).toBe('"hh*8"');
  });

  it('refuses a sound where a function is wanted', () => {
    // `bd(400)` parses and then fails at run time - worse than doing nothing.
    expect(replacementFor(lpf, { kind: 'sounds', name: 'bd' })).toBeNull();
  });

  it('refuses a snippet with no head mini-notation', () => {
    expect(replacementFor(s, { kind: 'snippets', name: 'x', code: 'stack(a, b)' })).toBeNull();
  });

  it('is null with nothing browsed', () => {
    expect(replacementFor(s, null)).toBeNull();
    expect(replacementFor(null, { kind: 'sounds', name: 'bd' })).toBeNull();
  });
});

describe('stepFunction', () => {
  it('wraps at both ends - these are endless encoders', () => {
    expect(stepFunction(3, 1, 4)).toBe(0);
    expect(stepFunction(0, -1, 4)).toBe(3);
  });

  it('has nowhere to go in a block with no calls', () => {
    expect(stepFunction(0, 1, 0)).toBeNull();
  });
});
