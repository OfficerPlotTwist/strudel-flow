import { describe, expect, it } from 'vitest';
import { createBlockCursor } from '../src/browse.js';
import { createStepper, wrapIndex } from '../src/browse.js';

describe('wrapIndex', () => {
  it('walks a list and wraps at both ends', () => {
    expect(wrapIndex(0, 1, 4)).toBe(1);
    expect(wrapIndex(3, 1, 4)).toBe(0);
    expect(wrapIndex(0, -1, 4)).toBe(3);
    expect(wrapIndex(1, 5, 4)).toBe(2);
    expect(wrapIndex(1, -5, 4)).toBe(0);
  });

  it('has nowhere to go in an empty list', () => {
    expect(wrapIndex(0, 1, 0)).toBe(0);
  });
});

describe('createBlockCursor', () => {
  it('starts on the first block with nothing pinned', () => {
    const c = createBlockCursor();
    expect(c.cursor).toBe(0);
    expect(c.indexes(3)).toEqual([0]);
  });

  it('moves the cursor, and the selection follows it', () => {
    // Scrolling with nothing pinned is a single moving selection - the
    // previous block is left behind, which is what makes pinning meaningful.
    const c = createBlockCursor();
    c.move(2, 4);
    expect(c.cursor).toBe(2);
    expect(c.indexes(4)).toEqual([2]);
  });

  it('wraps rather than stopping at the ends', () => {
    const c = createBlockCursor();
    c.move(-1, 3);
    expect(c.cursor).toBe(2);
  });

  it('pins the current block so it survives moving on', () => {
    const c = createBlockCursor();
    c.latch();
    c.move(2, 4);
    expect(c.indexes(4)).toEqual([0, 2]);
  });

  it('pins several, in block order regardless of visiting order', () => {
    const c = createBlockCursor();
    c.move(3, 5);
    c.latch();
    c.move(-2, 5);
    c.latch();
    c.move(-1, 5);
    expect(c.indexes(5)).toEqual([0, 1, 3]);
  });

  it('unpins a block that is pinned again', () => {
    const c = createBlockCursor();
    c.latch();
    expect(c.indexes(3)).toEqual([0]);
    c.latch();
    c.move(1, 3);
    expect(c.indexes(3)).toEqual([1]); // block 0 let go
  });

  it('never reports the same block twice', () => {
    const c = createBlockCursor();
    c.latch(); // pins 0, which is also the cursor
    expect(c.indexes(3)).toEqual([0]);
  });

  it('clears everything, cursor included', () => {
    const c = createBlockCursor();
    c.move(2, 4);
    c.latch();
    c.clear();
    expect(c.cursor).toBe(0);
    expect(c.indexes(4)).toEqual([0]);
  });

  it('drops pins that no longer name a block', () => {
    // Blocks are addressed by index, and a rip or an edit can shorten the
    // song underneath a pinned set. A stale index would select whatever moved
    // into that position.
    const c = createBlockCursor();
    c.move(4, 6);
    c.latch();
    c.move(-4, 6);
    expect(c.indexes(2)).toEqual([0]);
  });

  it('brings an out-of-range cursor back into the document', () => {
    const c = createBlockCursor();
    c.move(5, 6);
    expect(c.indexes(2)).toEqual([1]);
    expect(c.cursor).toBe(1);
  });

  it('selects nothing in an empty document', () => {
    const c = createBlockCursor();
    expect(c.indexes(0)).toEqual([]);
  });
});

describe('createStepper', () => {
  it('passes on one step for every two', () => {
    const s = createStepper(2);
    expect(s.feed(1)).toBe(0);
    expect(s.feed(1)).toBe(1);
    expect(s.feed(1)).toBe(0);
    expect(s.feed(1)).toBe(1);
  });

  it('carries the remainder instead of dropping it', () => {
    // A slow turn must still arrive somewhere; rounding each message to zero
    // would make the control dead below a certain speed.
    const s = createStepper(4);
    expect([s.feed(1), s.feed(1), s.feed(1), s.feed(1)]).toEqual([0, 0, 0, 1]);
  });

  it('works the same in reverse', () => {
    const s = createStepper(2);
    expect(s.feed(-1)).toBe(0);
    expect(s.feed(-1)).toBe(-1);
  });

  it('does not carry a remainder across a change of direction', () => {
    // Half a step forward then half a step back is where it started, not a
    // step in either direction.
    const s = createStepper(2);
    expect(s.feed(1)).toBe(0);
    expect(s.feed(-1)).toBe(0);
    expect(s.feed(-1)).toBe(0);
    expect(s.feed(-1)).toBe(-1);
  });

  it('passes a big jump straight through', () => {
    expect(createStepper(2).feed(9)).toBe(4);
  });
});

describe('moveTo', () => {
  it('puts the cursor on a given block', () => {
    const cursor = createBlockCursor();
    cursor.moveTo(3);
    expect(cursor.cursor).toBe(3);
    expect(cursor.indexes(6)).toEqual([3]);
  });

  it('keeps pins, so a new block joins the selection', () => {
    // The pins were deliberate; creating a block should not clear them.
    const cursor = createBlockCursor();
    cursor.moveTo(0);
    cursor.latch();
    cursor.moveTo(4);
    expect(cursor.indexes(6)).toEqual([0, 4]);
  });

  it('ignores an index that is not a real block', () => {
    // A caller that miscounted must not silently move the cursor somewhere
    // arbitrary - appendBlock returns null when it had no tab to write to.
    const cursor = createBlockCursor();
    cursor.moveTo(2);
    for (const bad of [-1, null, undefined, 1.5, 'x']) cursor.moveTo(bad);
    expect(cursor.cursor).toBe(2);
  });

  it('leaves stepping from the new position', () => {
    const cursor = createBlockCursor();
    cursor.moveTo(2);
    cursor.move(1, 5);
    expect(cursor.cursor).toBe(3);
  });
});
