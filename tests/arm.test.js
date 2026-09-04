import { describe, expect, it } from 'vitest';
import { listBlocks } from '../src/blocks.js';
import {
  ARM_MAX_CYCLES,
  applyArm,
  armChain,
  armTarget,
  armable,
  crossfaderCycles,
} from '../src/arm.js';

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
    expect(crossfaderCycles(0.1)).toBe(0);
    expect(crossfaderCycles(0.2)).toBe(1);
    expect(crossfaderCycles(0.125)).toBe(1);
  });

  it('clamps anything outside the fader range', () => {
    expect(crossfaderCycles(-1)).toBe(0);
    expect(crossfaderCycles(9)).toBe(ARM_MAX_CYCLES);
    expect(crossfaderCycles(null)).toBe(0);
    expect(crossfaderCycles(undefined)).toBe(0);
  });
});

describe('armTarget', () => {
  it('lands on a whole cycle, never part way through one', () => {
    // A change that arrives at cycle 5.7 arrives in the middle of a bar. The
    // countdown is measured to the next bar line, then whole cycles from there.
    expect(armTarget(3.7, 2)).toBe(6);
    expect(armTarget(3.1, 2)).toBe(6);
    expect(armTarget(3.9, 2)).toBe(6);
  });

  it('goes to the next bar line at zero cycles', () => {
    // Hard left on the crossfader is "as soon as possible", and the soonest
    // musical moment is the next downbeat - not this instant.
    expect(armTarget(3.7, 0)).toBe(4);
    expect(armTarget(3.01, 0)).toBe(4);
  });

  it('fires immediately when the press lands exactly on a bar line', () => {
    expect(armTarget(4, 0)).toBe(4);
    expect(armTarget(4, 3)).toBe(7);
  });

  it('survives a transport that reports nothing', () => {
    expect(armTarget(0, 0)).toBe(0);
    expect(armTarget(0, 4)).toBe(4);
  });
});

describe('armChain', () => {
  it('is empty when the target is already here', () => {
    expect(armChain('play', 4, 4)).toBe('');
    expect(armChain('stop', 4, 4)).toBe('');
  });

  it('holds silent from the press until the target, then opens', () => {
    // Pressed at 3.7 for two cycles: silent across 3.7 -> 6, sounding at 6.
    // The half must be long enough to cover the part-cycle before the first
    // bar line, so it is ceil(6 - 3.7) = 3, not 2.
    expect(armChain('play', 3.7, 6)).toBe('.mul(gain("0 1".slow(6).late(3.0000)))');
  });

  it('holds sounding until the target, then closes', () => {
    expect(armChain('stop', 3.7, 6)).toBe('.mul(gain("1 0".slow(6).late(3.0000)))');
  });

  it('covers a bare part-cycle at zero cycles', () => {
    // 3.7 -> 4 is less than a whole cycle, but the half is still two: the
    // gate repeats, so the half after the flip is the grace period before the
    // block would be muted again, and one cycle of it is no margin.
    expect(armChain('play', 3.7, 4)).toBe('.mul(gain("0 1".slow(4).late(2.0000)))');
  });

  it('gives at least two cycles of grace after the flip', () => {
    for (const [press, target] of [[3.7, 4], [0, 1], [9.9, 10]]) {
      const period = Number(armChain('play', press, target).match(/slow\((\d+)\)/)[1]);
      expect(period).toBeGreaterThanOrEqual(4);
    }
  });

  it('wraps the phase into one period', () => {
    expect(armChain('play', 0, 4)).toBe('.mul(gain("0 1".slow(8).late(0.0000)))');
    // Pressed at 8.5 for a target of 12: the half is 4, so the phase is
    // (12 - 4) = 8, which wraps to 0 in a period of 8. The closed half then
    // spans [8, 12) - it still contains the press and still flips at 12.
    expect(armChain('play', 8.5, 12)).toBe('.mul(gain("0 1".slow(8).late(0.0000)))');
  });

  it('scales the block gain rather than replacing it', () => {
    expect(armChain('play', 0, 2)).toContain('.mul(gain(');
    expect(armChain('play', 0, 2)).not.toMatch(/\)\.gain\(/);
  });
});

describe('armable', () => {
  it('play takes only blocks that are not already playing', () => {
    const targets = armable(SONG, [blockAt(SONG, 0), blockAt(SONG, 1)], 'play');
    expect(targets.map((b) => b.start)).toEqual([2]);
  });

  it('stop takes only blocks that are not already stopped', () => {
    const targets = armable(SONG, [blockAt(SONG, 0), blockAt(SONG, 1)], 'stop');
    expect(targets.map((b) => b.start)).toEqual([0]);
  });

  it('passes over statements that cannot carry a gain chain', () => {
    expect(armable(SONG, [blockAt(SONG, 3)], 'stop')).toEqual([]);
  });

  it('is empty when every selected block is already in that state', () => {
    expect(armable(SONG, [blockAt(SONG, 0)], 'play')).toEqual([]);
    expect(armable(SONG, [blockAt(SONG, 1)], 'stop')).toEqual([]);
  });
});

describe('applyArm', () => {
  it('appends the gate to the last line of each target', () => {
    const { lines: out } = applyArm(SONG, [blockAt(SONG, 0)], 'stop', 0, 2);
    expect(out[0]).toBe('$: s("bd sd").mul(gain("1 0".slow(4).late(0.0000)))');
    expect(out[4]).toBe('$: s("hh*8").gain(0.4)');
  });

  it('reports where it inserted, so highlights can be unshifted', () => {
    const { edits } = applyArm(SONG, [blockAt(SONG, 0)], 'stop', 0, 2);
    const chain = armChain('stop', 0, 2);
    expect(edits).toEqual([{ at: SONG[0].length, length: chain.length }]);
  });

  it('changes nothing when the target has arrived', () => {
    const { lines: out, edits } = applyArm(SONG, [blockAt(SONG, 0)], 'play', 3, 3);
    expect(out).toEqual(SONG);
    expect(edits).toEqual([]);
  });

  it('leaves every other line alone', () => {
    const { lines: out } = applyArm(SONG, [blockAt(SONG, 2)], 'stop', 0, 1);
    expect(out.length).toBe(SONG.length);
    expect(out.filter((line, i) => line !== SONG[i]).length).toBe(1);
  });
});

describe('armable rejects text that is not code', () => {
  const prose = lines(
    [
      '// ==============================================',
      '//  GET GOT  --  Death Grips (The Money Store, 2012)',
      '//  1 cycle = 1 bar.  Ctrl+Enter to play.',
      '// ==============================================',
    ].join('\n'),
  );

  it('will not play a block of prose comments', () => {
    // Uncommenting this gives "=====" and "GET GOT -- Death Grips (...)",
    // which reaches the parser as source and throws "unexpected token".
    expect(armable(prose, [blockAt(prose, 0)], 'play')).toEqual([]);
  });

  it('still plays a commented-out pattern', () => {
    const muted = lines('// $: s("bd sd")');
    expect(armable(muted, [blockAt(muted, 0)], 'play')).toHaveLength(1);
  });

  it('still plays a commented-out definition', () => {
    const muted = lines('// const kick = s("bd")\n//   .gain(1.2)');
    expect(armable(muted, [blockAt(muted, 0)], 'play')).toHaveLength(1);
  });

  it('still plays a commented-out bare call', () => {
    const muted = lines('// s("bd sd").fast(2)');
    expect(armable(muted, [blockAt(muted, 0)], 'play')).toHaveLength(1);
  });

  it('judges the first real line, not a chain continuation', () => {
    const muted = lines('// $: s("bd")\n//   .fast(2)\n//   .room(0.3)');
    expect(armable(muted, [blockAt(muted, 0)], 'play')).toHaveLength(1);
  });
});

describe('armable rejects blocks the gate cannot attach to', () => {
  it('attaches the gate above a trailing comment, not after it', () => {
    // After the comment the chain parses cleanly and does nothing at all,
    // because it is inside the comment. The block is still perfectly
    // armable - it is ordinary code with a note attached - so the gate goes
    // on the code instead of the block being refused.
    const song = lines('$: s("bd")\n  .fast(2)\n  // why this is here');
    expect(armable(song, [blockAt(song, 0)], 'stop')).toHaveLength(1);
    const { lines: out } = applyArm(song, [blockAt(song, 0)], 'stop', 0, 2);
    expect(out[1]).toContain('.mul(gain(');
    expect(out[2]).toBe('  // why this is here');
  });

  it('will not arm a block left mid-expression', () => {
    const song = lines('$: stack(\n  s("bd"),');
    expect(armable(song, [blockAt(song, 0)], 'stop')).toEqual([]);
  });

  it('still arms an ordinary multi-line chain', () => {
    const song = lines('$: s("bd")\n  .fast(2)\n  .room(0.3)');
    expect(armable(song, [blockAt(song, 0)], 'stop')).toHaveLength(1);
  });

  it('still arms a block that closes a multi-line call', () => {
    const song = lines('$: stack(\n  s("bd"),\n  s("sd")\n)');
    expect(armable(song, [blockAt(song, 0)], 'stop')).toHaveLength(1);
  });

  it('still arms a block referring to a name defined elsewhere', () => {
    // new Function compiles, it does not run - an undefined identifier is
    // not a syntax error and must not disqualify the block.
    const song = lines('$: stack(kick, snare).gain(0.8)');
    expect(armable(song, [blockAt(song, 0)], 'stop')).toHaveLength(1);
  });
});

describe('a block labelled with a comment is still code', () => {
  const labelled = [
    '// verse kick, crashed downbeat',
    '$: s("bd ~ sd")',
    '  .gain(0.9)',
  ];
  const block = { start: 0, end: 2, index: 0 };

  it('arms a live block that opens with a comment', () => {
    // Judging a block by its first line rejected every part carrying a label,
    // which - once each block was given a one-line description - was all of
    // them. The whole song became unarmable and play did nothing.
    expect(armable(labelled, [block], 'stop')).toHaveLength(1);
  });

  it('arms a stopped block that opens with a comment', () => {
    // A stopped block has its LABEL commented too, so the label is doubled -
    // uncommenting restores it as a comment rather than as bare prose.
    const stopped = ['// // verse kick', '// $: s("bd ~ sd")', '//   .gain(0.9)'];
    expect(armable(stopped, [{ start: 0, end: 2, index: 0 }], 'play')).toHaveLength(1);
  });

  it('refuses a block whose label would uncomment into prose', () => {
    // Singly-commented prose above commented code is not a stopped block,
    // it is a block someone commented by hand and left half-labelled.
    // Uncommenting it would put `verse kick` in the render.
    const half = ['// verse kick', '// $: s("bd ~ sd")'];
    expect(armable(half, [{ start: 0, end: 1, index: 0 }], 'play')).toHaveLength(0);
  });

  it('still refuses a block that is only prose', () => {
    // The arrangement notes at the foot of a song uncomment into words, not
    // code, and must never be armed into the render.
    const prose = ['// arrangement, tab order', '// arrange(', '//   [2, toms],'];
    expect(armable(prose, [{ start: 0, end: 2, index: 0 }], 'play')).toHaveLength(0);
  });

  it('arms a bare call under its label', () => {
    const mix = ['// full mix', 'stack(kick, snare).postgain(0.5)'];
    expect(armable(mix, [{ start: 0, end: 1, index: 0 }], 'stop')).toHaveLength(1);
  });
});
