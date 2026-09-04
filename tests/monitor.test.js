import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MONITOR_CHANNELS,
  MONITOR_ORBIT,
  monitorSuffix,
  outputChannelCount,
  splitAvailable,
  splitStatus,
  toMonitor,
} from '../src/monitor.js';

/** An AudioContext stub that claims a given number of output channels. */
const withChannels = (maxChannelCount) => ({ destination: { maxChannelCount } });

describe('master / monitor split confirmation', () => {
  it('needs four channels: two for the mains and two for the cue', () => {
    expect(splitAvailable(withChannels(2))).toBe(false);
    expect(splitAvailable(withChannels(4))).toBe(true);
    expect(splitAvailable(withChannels(8))).toBe(true);
  });

  it('refuses to claim a split on a stereo-only output', () => {
    // The failure a cue exists to prevent: sending it to channels that do not
    // exist folds it silently back into the mains, and the room hears the
    // thing being auditioned.
    expect(splitAvailable(withChannels(2))).toBe(false);
    expect(splitStatus(withChannels(2))).toBe('monitor needs 4 channels, output has 2');
  });

  it('says what is wrong in terms someone can act on', () => {
    expect(splitStatus(withChannels(0))).toBe('no audio output');
    expect(splitStatus(withChannels(4))).toBe('monitor on 3/4 of 4 channels');
  });

  it('survives having no audio context at all', () => {
    expect(outputChannelCount(null)).toBe(0);
    expect(splitAvailable(null)).toBe(false);
    expect(splitStatus(undefined)).toBe('no audio output');
  });

  it('honours a custom channel pair', () => {
    expect(splitAvailable(withChannels(4), [5, 6])).toBe(false);
    expect(splitAvailable(withChannels(6), [5, 6])).toBe(true);
  });
});

describe('monitor routing', () => {
  it('sends the cue to its own orbit, so effects do not bleed between buses', () => {
    expect(monitorSuffix()).toBe(`.orbit(${MONITOR_ORBIT}).channels("3 4")`);
    expect(DEFAULT_MONITOR_CHANNELS).toEqual([3, 4]);
  });

  it('wraps a block so the suffix lands on the finished pattern', () => {
    const block = 's("bd")\n  .gain(0.9)';
    const out = toMonitor(block);
    expect(out).toBe(`stack(\n${block}\n)${monitorSuffix()}`);
  });

  it('keeps a label outside the wrapper', () => {
    // `stack($: ...)` is not JavaScript.
    expect(toMonitor('$: s("bd")')).toBe(`$: stack(\ns("bd")\n)${monitorSuffix()}`);
  });

  it('does not take the suffix inside a trailing comment', () => {
    // Chaining onto the last LINE would put .orbit() inside the comment and
    // the block would route to the mains with no error anywhere.
    const out = toMonitor('s("bd")\n  .gain(1)\n// the kick');
    expect(out).toContain('// the kick\n)');
    expect(out.endsWith(monitorSuffix())).toBe(true);
  });
});
