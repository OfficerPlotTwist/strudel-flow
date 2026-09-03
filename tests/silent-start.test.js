import { beforeEach, describe, expect, it, vi } from 'vitest';

// live.js reaches the engine through these two; stub them so the transport
// contract can be tested without an AudioContext.
const evaluateCode = vi.fn(async () => ({ success: true, miniLocations: [] }));
const hushEngine = vi.fn();
vi.mock('../src/engine.js', () => ({
  evaluateCode: (...a) => evaluateCode(...a),
  hushEngine: (...a) => hushEngine(...a),
}));

const { createLive } = await import('../src/live.js');

function fakePane(code = '$: s("bd sd")') {
  const tabs = [{ id: 't1', name: 'song-1' }];
  return {
    getTabs: () => tabs,
    getActiveId: () => 't1',
    getCode: () => code,
    setMiniLocations: () => {},
    clearHighlight: () => {},
  };
}

describe('the app boots silent and stays silent until triggered', () => {
  beforeEach(() => {
    evaluateCode.mockClear();
    hushEngine.mockClear();
  });

  it('is not running before anything is triggered', () => {
    expect(createLive({ pane: fakePane() }).isRunning()).toBe(false);
  });

  it('refresh() does nothing at all while stopped', async () => {
    const live = createLive({ pane: fakePane() });
    const result = await live.refresh();
    expect(evaluateCode).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(live.isRunning()).toBe(false);
  });

  it('evaluateActive() is the deliberate trigger and starts the transport', async () => {
    const live = createLive({ pane: fakePane() });
    await live.evaluateActive();
    expect(evaluateCode).toHaveBeenCalledTimes(1);
    expect(live.isRunning()).toBe(true);
  });

  it('once running, an edit re-renders through refresh()', async () => {
    const live = createLive({ pane: fakePane() });
    await live.evaluateActive();
    evaluateCode.mockClear();
    await live.refresh();
    expect(evaluateCode).toHaveBeenCalledTimes(1);
  });

  it('stop() hushes AND stays stopped, so a later edit does not restart it', async () => {
    const live = createLive({ pane: fakePane() });
    await live.evaluateActive();
    live.stop();
    expect(hushEngine).toHaveBeenCalledTimes(1);
    expect(live.isRunning()).toBe(false);

    evaluateCode.mockClear();
    await live.refresh();
    expect(evaluateCode).not.toHaveBeenCalled();
  });

  it('emptying the song stops the transport rather than erroring on blank code', async () => {
    const pane = fakePane('   \n\n  ');
    const live = createLive({ pane });
    const { success } = await live.evaluateActive();
    expect(success).toBe(true);
    expect(evaluateCode).not.toHaveBeenCalled();
    expect(hushEngine).toHaveBeenCalled();
    expect(live.isRunning()).toBe(false);
  });
});
