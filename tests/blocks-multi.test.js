import { describe, expect, it } from 'vitest';
import {
  findBlocksInRange,
  listBlocks,
  toggleBlocksComment,
  uncommentForPlayback,
} from '../src/blocks.js';

const script = [
  'setcps(0.5)',
  '',
  '$: s("bd sd")',
  '  .gain(0.8)',
  '',
  '$: note("c e g")',
];

describe('listBlocks', () => {
  it('indexes every block in source order', () => {
    expect(listBlocks(script)).toEqual([
      { start: 0, end: 0 },
      { start: 2, end: 3 },
      { start: 5, end: 5 },
    ]);
  });

  it('is empty for an all-blank file', () => {
    expect(listBlocks(['', '  ', ''])).toEqual([]);
  });
});

describe('findBlocksInRange', () => {
  it('returns every block the selection touches', () => {
    expect(findBlocksInRange(script, 0, 3)).toEqual([
      { start: 0, end: 0 },
      { start: 2, end: 3 },
    ]);
  });

  it('picks up blocks even when the selection ends on a blank line', () => {
    expect(findBlocksInRange(script, 2, 4)).toEqual([{ start: 2, end: 3 }]);
  });

  it('is empty for a selection lying entirely in blank space', () => {
    expect(findBlocksInRange(script, 1, 1)).toEqual([]);
  });

  it('accepts a reversed selection', () => {
    expect(findBlocksInRange(script, 3, 0)).toHaveLength(2);
  });
});

describe('toggleBlocksComment', () => {
  const blocks = findBlocksInRange(script, 0, 5);

  it('comments every selected block', () => {
    expect(toggleBlocksComment(script, blocks)).toEqual([
      '// setcps(0.5)',
      '',
      '// $: s("bd sd")',
      '  // .gain(0.8)',
      '',
      '// $: note("c e g")',
    ]);
  });

  it('round-trips back to the original', () => {
    expect(toggleBlocksComment(toggleBlocksComment(script, blocks), blocks)).toEqual(script);
  });

  it('commenting a mixed selection does not double-comment the commented ones', () => {
    // Only the middle block starts commented; one keystroke must leave the
    // whole selection commented exactly once, not `// // .gain(0.8)`.
    const mixed = toggleBlocksComment(script, [{ start: 2, end: 3 }]);
    expect(toggleBlocksComment(mixed, blocks)).toEqual([
      '// setcps(0.5)',
      '',
      '// $: s("bd sd")',
      '  // .gain(0.8)',
      '',
      '// $: note("c e g")',
    ]);
  });

  it('leaves the file alone when nothing is selected', () => {
    expect(toggleBlocksComment(script, [])).toEqual(script);
  });
});

describe('uncommentForPlayback', () => {
  const commented = toggleBlocksComment(script, [{ start: 2, end: 3 }]);

  it('makes a commented block live without changing any line length', () => {
    const played = uncommentForPlayback(commented, [{ start: 2, end: 3 }]);
    expect(played).toEqual(['setcps(0.5)', '', '   $: s("bd sd")', '     .gain(0.8)', '', '$: note("c e g")']);
    // The length invariant is what keeps highlight offsets valid.
    expect(played.join('\n')).toHaveLength(commented.join('\n').length);
  });

  it('leaves an already-live block untouched', () => {
    expect(uncommentForPlayback(script, [{ start: 2, end: 3 }])).toEqual(script);
  });
});
