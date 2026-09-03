import { beforeEach, describe, expect, it, vi } from 'vitest';

const evaluateCode = vi.fn();
vi.mock('../src/engine.js', () => ({ evaluateCode: (...args) => evaluateCode(...args) }));

const { createLive } = await import('../src/live.js');

/** A stand-in for the editor pane: just the surface live.js actually uses. */
function fakePane(tabs, activeId) {
  const set = vi.fn();
  const cleared = vi.fn();
  return {
    getTabs: () => tabs.map(({ id, name }) => ({ id, name })),
    getActiveId: () => activeId,
    getCode: (id) => tabs.find((t) => t.id === id).code,
    setMiniLocations: set,
    clearHighlight: cleared,
    _set: set,
    _cleared: cleared,
  };
}

const drums = { id: 'tab-1', name: 'drums', code: '$: s("bd sd")\n\n// $: s("hh*8")' };
const bass = { id: 'tab-2', name: 'bass', code: '$: note("c2 e2")' };

beforeEach(() => {
  evaluateCode.mockReset();
  evaluateCode.mockResolvedValue({ success: true, miniLocations: [] });
});

describe('renderSource', () => {
  it('sends only the active tab by default', () => {
    const live = createLive({ pane: fakePane([drums, bass], 'tab-1') });
    expect(live.renderSource().code).toBe(drums.code);
  });

  it('folds an added tab in after the active one, blank-line separated', () => {
    const live = createLive({ pane: fakePane([drums, bass], 'tab-1') });
    live.setTabHeld('tab-2', 'add', true);
    expect(live.renderSource().code).toBe(`${drums.code}\n\n${bass.code}`);
  });

  it('solo suppresses every other tab, including the active one', () => {
    const live = createLive({ pane: fakePane([drums, bass], 'tab-1') });
    live.setTabHeld('tab-2', 'solo', true);
    expect(live.renderSource().code).toBe(bass.code);
    expect(live.contributingIds()).toEqual(['tab-2']);
  });

  it('solo wins over a simultaneously held add', () => {
    const live = createLive({ pane: fakePane([drums, bass], 'tab-1') });
    live.setTabHeld('tab-2', 'add', true);
    live.setTabHeld('tab-2', 'solo', true);
    expect(live.contributingIds()).toEqual(['tab-2']);
  });

  it('keeps tabs in tab order regardless of the order keys went down', () => {
    const live = createLive({ pane: fakePane([drums, bass], 'tab-2') });
    live.setTabHeld('tab-1', 'add', true);
    expect(live.contributingIds()).toEqual(['tab-1', 'tab-2']);
  });

  it('makes a held block live without changing the length of the source', () => {
    const live = createLive({ pane: fakePane([drums, bass], 'tab-1') });
    live.setBlockHeld(1, true);
    const { code } = live.renderSource();
    expect(code).toBe('$: s("bd sd")\n\n   $: s("hh*8")');
    expect(code).toHaveLength(drums.code.length);
  });

  it('applies block holds to the active tab only', () => {
    // Block 1 of `drums` is the commented one; the same index in `bass` does
    // not exist, and must not be unmuted there when bass is soloed.
    const live = createLive({ pane: fakePane([drums, bass], 'tab-1') });
    live.setBlockHeld(1, true);
    live.setTabHeld('tab-2', 'solo', true);
    expect(live.renderSource().code).toBe(bass.code);
  });
});

describe('setHeld edge detection', () => {
  it('reports a change only on a real edge, so autorepeat does not re-parse', () => {
    const live = createLive({ pane: fakePane([drums], 'tab-1') });
    expect(live.setBlockHeld(0, true)).toBe(true);
    expect(live.setBlockHeld(0, true)).toBe(false);
    expect(live.setBlockHeld(0, false)).toBe(true);
    expect(live.setBlockHeld(0, false)).toBe(false);
  });

  it('releaseAll drops holds of every kind, and reports whether it did anything', () => {
    const live = createLive({ pane: fakePane([drums, bass], 'tab-1') });
    expect(live.releaseAll()).toBe(false);
    live.setTabHeld('tab-2', 'add', true);
    live.setBlockHeld(1, true);
    expect(live.releaseAll()).toBe(true);
    expect(live.renderSource().code).toBe(drums.code);
  });
});

describe('evaluateActive', () => {
  it('rebases each tab\'s mini-locations into that tab\'s own offsets', async () => {
    const pane = fakePane([drums, bass], 'tab-1');
    const live = createLive({ pane });
    live.setTabHeld('tab-2', 'add', true);
    const base = drums.code.length + 2; // where bass starts in the joined source
    evaluateCode.mockResolvedValue({
      success: true,
      miniLocations: [
        [6, 8],
        [base + 9, base + 11],
      ],
    });

    await live.evaluateActive();

    expect(pane._set).toHaveBeenCalledWith('tab-1', [[6, 8]]);
    expect(pane._set).toHaveBeenCalledWith('tab-2', [[9, 11]]);
  });

  it('clears tabs that are not playing', async () => {
    const pane = fakePane([drums, bass], 'tab-1');
    const live = createLive({ pane });
    await live.evaluateActive();
    expect(pane._set).toHaveBeenCalledWith('tab-2', []);
    expect(pane._cleared).toHaveBeenCalledWith('tab-2');
  });

  it('shows no outline anywhere when evaluation fails', async () => {
    const pane = fakePane([drums], 'tab-1');
    const live = createLive({ pane });
    evaluateCode.mockResolvedValue({ success: false, miniLocations: null });
    await live.evaluateActive();
    expect(pane._set).toHaveBeenCalledWith('tab-1', []);
  });

  it('serialises overlapping evaluations instead of racing them', async () => {
    const pane = fakePane([drums], 'tab-1');
    const live = createLive({ pane });
    const order = [];
    evaluateCode.mockImplementation(async () => {
      order.push('start');
      await Promise.resolve();
      order.push('end');
      return { success: true, miniLocations: [] };
    });
    await Promise.all([live.evaluateActive(), live.evaluateActive()]);
    expect(order).toEqual(['start', 'end', 'start', 'end']);
  });
});
