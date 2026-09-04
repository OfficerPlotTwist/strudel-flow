import { describe, expect, it } from 'vitest';
import { callsIn, diffCalls, functionSpans } from '../src/changes.js';

const names = (list) => list.map((c) => c.name);

describe('callsIn', () => {
  it('captures each call with its argument text', () => {
    expect(callsIn('$: s("bd sd").fast(2)')).toEqual([
      expect.objectContaining({ name: 's', args: '"bd sd"' }),
      expect.objectContaining({ name: 'fast', args: '2' }),
    ]);
  });

  it('keeps nested parens together', () => {
    const calls = callsIn('$: s("bd").mul(gain(0.5))');
    expect(calls.find((c) => c.name === 'mul').args).toBe('gain(0.5)');
  });

  it('reads a function used with no arguments', () => {
    expect(callsIn('$: s("bd").rev()').find((c) => c.name === 'rev').args).toBe('');
  });

  it('ignores mini-notation words inside strings', () => {
    // `rev` here is a sample name, not a call - scanFunctions already discards
    // string contents and this must not undo that.
    expect(names(callsIn('$: s("rev bd")'))).toEqual(['s']);
  });

  it('reports where the call sits, for colouring it in place', () => {
    const [first] = callsIn('$: s("bd")');
    expect(first.from).toBe(3);
    expect(first.to).toBe(4);
  });
});

describe('diffCalls', () => {
  it('sees nothing when the code did not change', () => {
    const code = '$: s("bd").fast(2)';
    expect(diffCalls(code, code)).toEqual([]);
  });

  it('reports a function appended to a line', () => {
    const before = '$: s("bd")';
    const after = '$: s("bd").fast(2)';
    expect(diffCalls(before, after)).toEqual([
      expect.objectContaining({ name: 'fast', kind: 'appended', args: '2' }),
    ]);
  });

  it('reports arguments that were retuned in place', () => {
    const before = '$: s("bd").fast(2)';
    const after = '$: s("bd").fast(4)';
    expect(diffCalls(before, after)).toEqual([
      expect.objectContaining({ name: 'fast', kind: 'retuned', args: '4', was: '2' }),
    ]);
  });

  it('does not call an unchanged neighbour a change', () => {
    const before = '$: s("bd").fast(2).room(0.3)';
    const after = '$: s("bd").fast(4).room(0.3)';
    expect(names(diffCalls(before, after))).toEqual(['fast']);
  });

  it('reports every function that changed in one edit', () => {
    // The rotation exists for exactly this: paste a whole line and several
    // things changed at once, each worth reading.
    const before = '$: s("bd")';
    const after = '$: s("bd").fast(2).room(0.3)';
    expect(names(diffCalls(before, after))).toEqual(['fast', 'room']);
  });

  it('tells a second use of a function from a retune of the first', () => {
    const before = '$: s("bd").fast(2)';
    const after = '$: s("bd").fast(2).fast(3)';
    expect(diffCalls(before, after)).toEqual([
      expect.objectContaining({ name: 'fast', kind: 'appended', args: '3' }),
    ]);
  });

  it('reports nothing for a removal', () => {
    // Deleting is not something to explain - there is no function to describe
    // and the explainer would be pointing at text that is gone.
    expect(diffCalls('$: s("bd").fast(2)', '$: s("bd")')).toEqual([]);
  });

  it('reports in source order, so the rotation reads left to right', () => {
    const before = '$: s("bd")';
    const after = '$: s("bd").room(0.3).fast(2)';
    expect(names(diffCalls(before, after))).toEqual(['room', 'fast']);
  });

  it('survives a first edit with nothing before it', () => {
    expect(names(diffCalls('', '$: s("bd")'))).toEqual(['s']);
  });
});

describe('functionSpans', () => {
  it('finds functions in a live block and marks them live', () => {
    const spans = functionSpans('$: s("bd").fast(2)');
    expect(spans.map((s) => [s.name, s.live])).toEqual([
      ['s', true],
      ['fast', true],
    ]);
  });

  it('finds functions inside a commented block and marks them dead', () => {
    // scanFunctions throws comments away on purpose; without the uncommented
    // projection these occurrences would simply not exist to colour.
    const spans = functionSpans('// $: s("bd").fast(2)');
    expect(spans.map((s) => [s.name, s.live])).toEqual([
      ['s', false],
      ['fast', false],
    ]);
  });

  it('reports offsets into the REAL document, not the projection', () => {
    const code = '// $: s("bd")';
    const [span] = functionSpans(code);
    expect(code.slice(span.from, span.to)).toBe('s');
  });

  it('judges each block on its own', () => {
    const code = '$: s("bd")\n\n// $: note("c")';
    expect(functionSpans(code).map((s) => [s.name, s.live])).toEqual([
      ['s', true],
      ['note', false],
    ]);
  });
});
