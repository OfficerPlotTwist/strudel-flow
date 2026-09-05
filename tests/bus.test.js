import { describe, expect, it } from 'vitest';
import { SONG_ORBIT, busBlock, busSize, busSizeSpan, busStrays, ensureBus, hasBus } from '../src/bus.js';
import { blockFunctions, replacementFor } from '../src/fn-browse.js';
import {
  MASTER_CONTROLS,
  MASTER_TRACK,
  PART_TRACKS,
  REVERB_CONTROLS,
  REVERB_TRACK,
  bindFixedControls,
  callText,
  findNumericArgs,
} from '../src/args.js';

describe('reverb bus', () => {
  it('puts one size and one orbit in the song', () => {
    const block = busBlock(4);
    expect(block).toContain('roomsize(4)');
    expect(block).toContain(`orbit(${SONG_ORBIT})`);
    // One orbit for the whole song: two blocks cannot disagree about the size,
    // so the per-event regeneration superdough warns about cannot be written.
    expect(block.match(/orbit\(/g)).toHaveLength(1);
  });

  it('is added once and never twice', () => {
    const song = '$: s("bd")';
    const once = ensureBus(song);
    expect(hasBus(once)).toBe(true);
    expect(ensureBus(once)).toBe(once);
  });

  it('goes after the music, not before it', () => {
    const out = ensureBus('$: s("bd")');
    expect(out.indexOf('$: s("bd")')).toBeLessThan(out.indexOf('roomsize'));
  });

  it('survives an empty song', () => {
    expect(ensureBus('')).toBe(busBlock(2));
  });

  it('reads its size back', () => {
    expect(busSize(ensureBus('$: s("bd")', 6))).toBe(6);
    expect(busSize('$: s("bd")')).toBeNull();
  });

  it('reports the size as a span the knob can overwrite in place', () => {
    const song = ensureBus('$: s("bd")', 6);
    const span = busSizeSpan(song);
    expect(song.slice(span.from, span.to)).toBe('6');
    // Replacing just those characters leaves every other offset alone, so the
    // selection and the mini-notation highlights do not slide.
    const next = song.slice(0, span.from) + '3' + song.slice(span.to);
    expect(busSize(next)).toBe(3);
  });

  it('is found by its call, not by its comment', () => {
    expect(hasBus('// my own name\nall(x => x.roomsize(3).orbit(1))')).toBe(true);
  });
});

describe('reserved tracks', () => {
  it('deals parts across seven tracks, leaving 8 and master alone', () => {
    expect(PART_TRACKS).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(PART_TRACKS).not.toContain(REVERB_TRACK);
    expect(PART_TRACKS).not.toContain(MASTER_TRACK);
  });

  it('gives master the block output stage, in knob order', () => {
    expect(MASTER_CONTROLS.map((c) => c.label)).toEqual([
      'attack', 'decay', 'sustain', 'release', 'lpf', 'hpf', 'postgain',
    ]);
  });

  it('splits the reverb pair by scope', () => {
    const [room, size] = REVERB_CONTROLS;
    expect(room.shared).toBeFalsy(); // a per-event send, per block
    expect(size.shared).toBe(true); // a property of the orbit's one reverb
  });
});

describe('bindFixedControls', () => {
  const BLOCK = 's("bd").lpf(400).postgain(0.8)';

  it('binds to the calls the block already has', () => {
    const { slots } = bindFixedControls(findNumericArgs(BLOCK), MASTER_CONTROLS, MASTER_TRACK);
    const lpf = slots.find((s) => s.label === 'lpf');
    expect(lpf.virtual).toBe(false);
    expect(lpf.value).toBe(400);
    expect(BLOCK.slice(lpf.from, lpf.to)).toBe('400');
  });

  it('still offers a control the block does not have yet', () => {
    // Otherwise the master volume would work on some blocks and not others,
    // which is worse than not having it.
    const { slots } = bindFixedControls(findNumericArgs(BLOCK), MASTER_CONTROLS, MASTER_TRACK);
    const attack = slots.find((s) => s.label === 'attack');
    expect(attack.virtual).toBe(true);
    expect(attack.from).toBeNull();
    expect(attack.value).toBe(0.01);
  });

  it('claims the arguments it took, so nothing gets two knobs', () => {
    const args = findNumericArgs(BLOCK);
    const { claimed } = bindFixedControls(args, MASTER_CONTROLS, MASTER_TRACK);
    const left = args.filter((a) => !claimed.has(a));
    // lpf and postgain went to master; the part tracks must not see them again.
    expect(left.map((a) => a.fn)).toEqual([]);
  });

  it('addresses master on channel 8, knobs 1..7', () => {
    const { slots } = bindFixedControls([], MASTER_CONTROLS, MASTER_TRACK);
    expect(slots.map((s) => s.knob)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(slots.map((s) => s.channel))).toEqual(new Set([8]));
    expect(slots.map((s) => s.cc)).toEqual([16, 17, 18, 19, 20, 21, 22]);
  });

  it('gives sustain a level range where the other three are times', () => {
    const { slots } = bindFixedControls([], MASTER_CONTROLS, MASTER_TRACK);
    expect(slots[2].range).toMatchObject({ min: 0, max: 1 });
    expect(slots[3].range).toMatchObject({ min: 0, max: 8 });
  });
});

describe('callText', () => {
  it('writes a plain call for a single-argument control', () => {
    expect(callText({ fn: 'postgain', position: 0 }, '0.7')).toBe('.postgain(0.7)');
  });

  it('writes all four numbers for adsr, not just the one turned', () => {
    // `.adsr(0.2)` would silently mean an attack of 0.2 and defaults for the
    // rest - three parameters changed by touching one knob.
    expect(callText({ fn: 'adsr', position: 1 }, '0.5')).toBe('.adsr(0.01, 0.5, 0.6, 0.2)');
  });
});

describe('the bus is not a part', () => {
  // The knobs deal addresses from whatever block the cursor is on, and the bus
  // is a top-level block like any other - on an empty song sheet it is the
  // only one, so it is where the cursor starts. Everything below is why
  // `refreshArgMap` refuses to deal from it.
  it('carries numbers a knob would otherwise claim', () => {
    const found = findNumericArgs(busBlock(2), 0);
    // `orbit(1)` is real, live, and would be handed to a part knob - turning
    // it re-orbits the whole song.
    expect(found.map((a) => a.fn)).toContain('orbit');
  });

  it('is recognisable as the bus, which is what the guard tests', () => {
    // Both the knobs and pattern build refuse the bus by asking hasBus(). A
    // change to busBlock that stopped matching would silently re-open both.
    expect(hasBus(busBlock(2))).toBe(true);
    expect(hasBus('$: s("bd*2").adsr(0.9, 0.1, 0.5, 0.9)')).toBe(false);
  });

  it('would take a master call onto all(), where it beats every block', () => {
    // Measured against the engine: a block calling .adsr(0.9, ...) reports an
    // attack of 0.9 alone and 0.05 once all() carries .adsr(0.05, ...). The
    // master controls are all VIRTUAL on the bus, so the first knob turn
    // appends exactly this.
    const slots = bindFixedControls(findNumericArgs(busBlock(2), 0), MASTER_CONTROLS, MASTER_TRACK);
    const adsr = slots.slots.find((s) => s.fn === 'adsr');
    expect(adsr.virtual).toBe(true);
    expect(busBlock(2) + callText(adsr, '0.05')).toContain('.orbit(1)).adsr(0.05,');
  });
});

describe('the bus is not browsable', () => {
  // TC 6 walks a block's functions and TAP TEMPO swaps one. On the bus that is
  // destructive in one direction and merely confusing in the other, and the
  // confusing half is what gets reported.
  it('offers roomsize as a NAME replacement, which rewrites the bus', () => {
    const fns = blockFunctions(busBlock(2), 0);
    const size = fns.find((f) => f.name === 'roomsize');
    expect(size).toBeDefined();
    // Not a documented effect, so it is replaced by NAME, not by argument.
    expect(size.replaces).toBe('function');
    // A funcs pick therefore goes straight through and the bus stops being one.
    const edit = replacementFor(size, { kind: 'funcs', name: 'lpf' });
    const rewritten =
      busBlock(2).slice(0, edit.from) + edit.text + busBlock(2).slice(edit.to);
    expect(hasBus(rewritten)).toBe(false);
  });

  it('refuses a sound pick, which is the half that gets reported', () => {
    const size = blockFunctions(busBlock(2), 0).find((f) => f.name === 'roomsize');
    expect(replacementFor(size, { kind: 'sounds', name: 'casiovl1_sd' })).toBe(null);
  });
});

describe('a bus carrying calls it should not', () => {
  const NEWLINE = String.fromCharCode(10);
  it('names the strays, and nothing on a clean bus', () => {
    expect(busStrays(busBlock(2))).toEqual([]);
    expect(busStrays(`$: s("bd*4")${NEWLINE}${NEWLINE}${busBlock(2)}`)).toEqual([]);
    // No bus at all is not a complaint.
    expect(busStrays('$: s("bd*4")')).toEqual([]);
  });

  it('catches what a master knob used to write there', () => {
    // The exact shape a knob turn produced before refreshArgMap refused the
    // bus. `.postgain(0)` on all() is a silent song.
    const poisoned = busBlock(2).replace(/\)$/, ').adsr(0.05, 0.1, 0.6, 0.2).postgain(0)');
    expect(busStrays(poisoned)).toEqual(['adsr', 'postgain']);
  });

  it('does not mistake another block for the bus', () => {
    // Only the line holding roomsize is the bus; a part with its own .lpf()
    // is a part.
    const song = `$: s("bd*4").lpf(400)${NEWLINE}${NEWLINE}${busBlock(2)}`;
    expect(busStrays(song)).toEqual([]);
  });
});
