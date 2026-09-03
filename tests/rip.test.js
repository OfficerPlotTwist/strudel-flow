import { describe, expect, it } from 'vitest';
import { listBlocks } from '../src/blocks.js';
import {
  applyFade,
  extractBlocks,
  fadeChain,
  isFadeable,
  removeBlocks,
  RIP_CYCLES,
  unshiftLocations,
} from '../src/rip.js';

const SONG = ['setcpm(120/4)', '', '$: s("bd sd")', '  .gain(0.8)', '', '// a note', '$: note("c e")'];
const blocks = listBlocks(SONG);

describe('isFadeable', () => {
  it('rejects a transport statement - appending a gain chain to it is a syntax error', () => {
    expect(isFadeable(SONG, blocks[0])).toBe(false);
  });

  it('accepts a pattern block', () => {
    expect(isFadeable(SONG, blocks[1])).toBe(true);
  });

  it('accepts a block whose first line is a comment, as long as code follows', () => {
    expect(isFadeable(SONG, blocks[2])).toBe(true);
  });

  it('rejects a block that is nothing but comments', () => {
    const lines = ['// just talking', '// still talking'];
    expect(isFadeable(lines, listBlocks(lines)[0])).toBe(false);
  });
});

describe('fadeChain', () => {
  it('multiplies rather than replaces, so a quiet part does not jump to full volume', () => {
    expect(fadeChain(0)).toContain('.mul(gain(');
    expect(fadeChain(0)).not.toMatch(/^\.gain\(/);
  });

  it('phase-shifts by the cycle so the ramp starts at full volume, not mid-fall', () => {
    expect(fadeChain(6)).toContain(`.late(${(6 % RIP_CYCLES).toFixed(4)})`);
  });

  it('keeps the phase positive for a negative cycle', () => {
    expect(fadeChain(-1)).toContain('.late(3.0000)');
  });
});

describe('applyFade', () => {
  it('appends the chain to the last line of each faded block only', () => {
    const { lines } = applyFade(SONG, [blocks[1]], 0);
    expect(lines[3]).toContain('.mul(gain(');
    expect(lines[2]).not.toContain('.mul(gain(');
  });

  it('leaves a non-fadeable block untouched and reports no edits for it', () => {
    const { lines, edits } = applyFade(SONG, [blocks[0]], 0);
    expect(lines).toEqual(SONG);
    expect(edits).toEqual([]);
  });

  it('reports each insertion at its offset in the RETURNED text', () => {
    const { lines, edits } = applyFade(SONG, [blocks[1], blocks[2]], 0);
    const out = lines.join('\n');
    for (const { at, length } of edits) {
      expect(out.slice(at, at + length)).toBe(fadeChain(0));
    }
  });
});

describe('unshiftLocations', () => {
  it('maps a location after an insertion back onto the untouched buffer', () => {
    const { lines, edits } = applyFade(SONG, [blocks[1]], 0);
    const out = lines.join('\n');
    // The `note("c e")` string lives after the inserted chain.
    const at = out.indexOf('"c e"');
    const [[from]] = unshiftLocations([[at, at + 5]], edits);
    expect(SONG.join('\n').slice(from, from + 5)).toBe('"c e"');
  });

  it('leaves a location before any insertion alone', () => {
    const edits = [{ at: 100, length: 30 }];
    expect(unshiftLocations([[10, 14]], edits)).toEqual([[10, 14]]);
  });

  it('drops a location that falls inside an insertion - it has no home in the buffer', () => {
    const edits = [{ at: 10, length: 30 }];
    expect(unshiftLocations([[12, 16]], edits)).toEqual([]);
  });
});

describe('extractBlocks / removeBlocks', () => {
  it('extracts the blocks verbatim, blank-line separated', () => {
    expect(extractBlocks(SONG, [blocks[1], blocks[2]])).toBe(
      '$: s("bd sd")\n  .gain(0.8)\n\n// a note\n$: note("c e")',
    );
  });

  it('removes the blocks without leaving a growing gap behind', () => {
    expect(removeBlocks(SONG, [blocks[1]])).toEqual([
      'setcpm(120/4)',
      '',
      '// a note',
      '$: note("c e")',
    ]);
  });

  it('trims leading and trailing blanks when the edge block goes', () => {
    expect(removeBlocks(SONG, [blocks[0]])).toEqual([
      '$: s("bd sd")',
      '  .gain(0.8)',
      '',
      '// a note',
      '$: note("c e")',
    ]);
  });

  it('removing every block leaves an empty document, not a pile of blanks', () => {
    expect(removeBlocks(SONG, blocks)).toEqual([]);
  });
});
