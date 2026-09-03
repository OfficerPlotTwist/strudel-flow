import { describe, expect, it } from 'vitest';
import { listBlocks } from '../src/blocks.js';
import { ARM_MAX_CYCLES, applyArm, armChain, armable, crossfaderCycles } from '../src/arm.js';

const lines = (text) => text.split('\n');

const SONG = lines(
  [
    '$: s("bd sd")',
    '',
    '// $: note("c e g")',
    '',
    '$: s("hh*8").gain(0.4)',
    '',
    'setcpm(120)',
  ].join('\n'),
);

const blockAt = (source, index) => listBlocks(source)[index];

describe('crossfaderCycles', () => {
  it('spans 0 to ARM_MAX_CYCLES across the fader', () => {
    expect(crossfaderCycles(0)).toBe(0);
    expect(crossfaderCycles(1)).toBe(ARM_MAX_CYCLES);
    expect(ARM_MAX_CYCLES).toBe(4);
  });

  it('rounds to the nearest whole cycle', () => {
    expect(crossfaderCycles(0.5)).toBe(2);
    expect(crossfaderCycles(0.1)).toBe(0); // 0.4 cycles
    expect(crossfaderCycles(0.2)).toBe(1); // 0.8 cycles
    expect(crossfaderCycles(0.125)).toBe(1); // exactly 0.5, rounds up
  });

  it('clamps anything outside the fader range', () => {
    // A control this app has never seen a value from reports nothing, and a
    // surface with a different range must not arm a negative countdown.
    expect(crossfaderCycles(-1)).toBe(0);
    expect(crossfaderCycles(9)).toBe(ARM_MAX_CYCLES);
    expect(crossfaderCycles(null)).toBe(0);
    expect(crossfaderCycles(undefined)).toBe(0);
  });
});

describe('armChain', () => {
  it('is empty at zero cycles - there is nothing to wait for', () => {
    expect(armChain('play', 0, 5)).toBe('');
    expect(armChain('stop', 0, 5)).toBe('');
  });

  it('gates silent-then-loud for play', () => {
    // Measured in Strudel: mini("0 1").slow(8).late(2) reads
    // [1,1, 0,0,0,0, 1,1,1] over cycles 0..8 - the zero half starts on the
    // cycle named by late(), which is why phase is the press cycle.
    expect(armChain('play', 4, 2)).toBe('.mul(gain("0 1".slow(8).late(2.0000)))');
  });

  it('gates loud-then-silent for stop', () => {
    expect(armChain('stop', 2, 7)).toBe('.mul(gain("1 0".slow(4).late(3.0000)))');
  });

  it('wraps the phase into one period', () => {
    // The transport clock free-runs; without the wrap a late() larger than the
    // period would push the gate a whole cycle out of step.
    expect(armChain('play', 2, 4)).toBe('.mul(gain("0 1".slow(4).late(0.0000)))');
    expect(armChain('play', 2, 5)).toBe('.mul(gain("0 1".slow(4).late(1.0000)))');
    expect(armChain('play', 2, -1)).toBe('.mul(gain("0 1".slow(4).late(3.0000)))');
  });

  it('scales the block gain rather than replacing it', () => {
    // `.gain()` at the end of a chain overrides what the block set for itself,
    // so a quiet part would jump to full volume the moment it was armed.
    expect(armChain('play', 1, 0)).toContain('.mul(gain(');
    expect(armChain('play', 1, 0)).not.toMatch(/\)\.gain\(/);
  });
});

describe('armable', () => {
  it('play takes only blocks that are not already playing', () => {
    const targets = armable(SONG, [blockAt(SONG, 0), blockAt(SONG, 1)], 'play');
    expect(targets.map((b) => b.start)).toEqual([2]); // the commented one
  });

  it('stop takes only blocks that are not already stopped', () => {
    const targets = armable(SONG, [blockAt(SONG, 0), blockAt(SONG, 1)], 'stop');
    expect(targets.map((b) => b.start)).toEqual([0]);
  });

  it('passes over statements that cannot carry a gain chain', () => {
    // `setcpm(120).mul(gain(...))` is a syntax error, not a countdown.
    expect(armable(SONG, [blockAt(SONG, 3)], 'stop')).toEqual([]);
  });

  it('is empty when every selected block is already in that state', () => {
    expect(armable(SONG, [blockAt(SONG, 0)], 'play')).toEqual([]);
    expect(armable(SONG, [blockAt(SONG, 1)], 'stop')).toEqual([]);
  });
});

describe('applyArm', () => {
  it('appends the gate to the last line of each target', () => {
    const { lines: out } = applyArm(SONG, [blockAt(SONG, 0)], 'stop', 2, 0);
    expect(out[0]).toBe('$: s("bd sd").mul(gain("1 0".slow(4).late(0.0000)))');
    expect(out[4]).toBe('$: s("hh*8").gain(0.4)'); // untouched
  });

  it('reports where it inserted, so highlights can be unshifted', () => {
    const { edits } = applyArm(SONG, [blockAt(SONG, 0)], 'stop', 2, 0);
    const chain = armChain('stop', 2, 0);
    expect(edits).toEqual([{ at: SONG[0].length, length: chain.length }]);
  });

  it('changes nothing at zero cycles', () => {
    const { lines: out, edits } = applyArm(SONG, [blockAt(SONG, 0)], 'play', 0, 3);
    expect(out).toEqual(SONG);
    expect(edits).toEqual([]);
  });

  it('leaves the buffer length alone for every other line', () => {
    // Only the armed block's own line grows; a chain landing on the wrong line
    // would slide every mini-notation highlight after it.
    const { lines: out } = applyArm(SONG, [blockAt(SONG, 2)], 'stop', 1, 0);
    expect(out.length).toBe(SONG.length);
    expect(out.filter((line, i) => line !== SONG[i]).length).toBe(1);
  });
});
