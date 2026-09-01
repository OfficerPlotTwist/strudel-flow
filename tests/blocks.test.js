import { describe, expect, it } from 'vitest';
import { findBlock, isBlockCommented, toggleBlockComment } from '../src/blocks.js';

const script = [
  'setcps(0.5)',
  '',
  '$: s("bd sd")',
  '  .gain(0.8)',
  '',
  '$: note("c e g")',
];

describe('findBlock', () => {
  it('returns the contiguous non-blank run around the cursor', () => {
    expect(findBlock(script, 3)).toEqual({ start: 2, end: 3 });
  });

  it('handles a single-line block', () => {
    expect(findBlock(script, 0)).toEqual({ start: 0, end: 0 });
  });

  it('extends to the end of the file', () => {
    expect(findBlock(script, 5)).toEqual({ start: 5, end: 5 });
  });

  it('returns null when the cursor is on a blank line', () => {
    expect(findBlock(script, 1)).toBeNull();
  });

  it('treats whitespace-only lines as blank', () => {
    expect(findBlock(['a', '   ', 'b'], 1)).toBeNull();
  });
});

describe('isBlockCommented', () => {
  it('is false when any line is uncommented', () => {
    expect(isBlockCommented(['// a', 'b'], 0, 1)).toBe(false);
  });

  it('is true when every line is commented', () => {
    expect(isBlockCommented(['// a', '// b'], 0, 1)).toBe(true);
  });
});

describe('toggleBlockComment', () => {
  it('comments an uncommented block, preserving indentation', () => {
    expect(toggleBlockComment(script, 2, 3)).toEqual([
      'setcps(0.5)',
      '',
      '// $: s("bd sd")',
      '  // .gain(0.8)',
      '',
      '$: note("c e g")',
    ]);
  });

  it('restores a commented block exactly', () => {
    const commented = toggleBlockComment(script, 2, 3);
    expect(toggleBlockComment(commented, 2, 3)).toEqual(script);
  });

  it('comments a partially commented block rather than restoring it', () => {
    expect(toggleBlockComment(['// a', 'b'], 0, 1)).toEqual(['// // a', '// b']);
  });
});
