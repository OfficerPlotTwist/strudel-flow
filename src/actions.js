import { getTransport } from './engine.js';
import { isStandaloneBlock, listBlocks, toggleBlocksComment } from './blocks.js';
import { extractBlocks, removeBlocks, RIP_CYCLES } from './rip.js';
import { armTarget, armable, crossfaderCycles } from './arm.js';

/** The bottom-bar tab ripped material is parked in. Created on first use. */
const RETURN_TAB = 'to return';

export function createActions({
  pane,
  panel,
  status,
  live,
  explainer,
  getCrossfader,
  getSelectAll,
}) {
  function shiftTab(delta) {
    const tabs = pane.getTabs();
    if (tabs.length < 2) return;
    const index = tabs.findIndex((t) => t.id === pane.getViewedId());
    const next = (index + delta + tabs.length) % tabs.length;
    pane.viewTab(tabs[next].id);
  }

  /** The bottom-bar holding tab, made on demand so it costs nothing until used. */
  function returnTabId() {
    const existing = pane.getTabs().find((t) => t.name === RETURN_TAB);
    return existing ? existing.id : pane.addTab(RETURN_TAB, '', { bar: 'bottom' });
  }

  let ripInFlight = false;

  /**
   * Rip the selected blocks out of the tab on screen: fade them to silence
   * over RIP_CYCLES, tear them off the page, then hand the text to `deliver`.
   *
   * The source is the VIEWED tab rather than the active one, because that is
   * the text the selection is in - and because destination 'active' is the
   * return trip, ripping out of the holding tab and back into the song.
   *
   * Blocks are addressed by INDEX throughout, and re-resolved against the
   * document after the fade rather than captured up front: four cycles is
   * seconds of wall clock, and the line numbers of a block the user edited in
   * the meantime would name the wrong text by the time the removal lands.
   */
  async function rip(deliver, label) {
    // One rip at a time. A second press mid-flight would race the first one's
    // removal, and both would compute their line numbers against a document
    // the other is about to rewrite.
    if (ripInFlight) {
      status.info('rip already in progress');
      return;
    }
    const id = pane.getViewedId();
    const selected = pane.getSelectedBlocks(id);
    if (selected.length === 0) {
      status.info('no block in selection');
      return;
    }
    const indexes = selected.map((b) => b.index);
    const { cycle, cps } = getTransport() ?? { cycle: 0, cps: 1 };

    ripInFlight = true;
    try {
      live.setRipping({ tabId: id, blockIndexes: indexes, cycle });
      // refresh, not evaluateActive: ripping blocks out of a song that is not
      // playing is an editing operation. It must not start the transport.
      await live.refresh();
      status.info(`ripping ${indexes.length} block(s) → ${label}`);
      await new Promise((resolve) => setTimeout(resolve, (RIP_CYCLES / cps) * 1000));

      const lines = pane.getCode(id).split('\n');
      const blocks = indexes.map((i) => listBlocks(lines)[i]).filter(Boolean);
      if (blocks.length === 0) return;
      const text = extractBlocks(lines, blocks);

      await pane.ripAnimate(id, blocks);
      pane.setCode(id, removeBlocks(lines, blocks).join('\n'));
      deliver(text);
    } finally {
      // Whatever happened, the fade must stop being rendered - otherwise the
      // ramp keeps multiplying into blocks that were never removed.
      live.setRipping(null);
      ripInFlight = false;
      await live.refresh();
    }
  }

  // Which arming press is current. A second press supersedes the first, and
  // the loser must not commit its edit when its own wait finally elapses -
  // that is the difference between overwriting a countdown and racing it.
  let armGeneration = 0;

  /**
   * Play or stop the selected blocks, after a countdown of whole cycles set by
   * the crossfader.
   *
   * The countdown itself is not a timer over the music - it is written INTO
   * the music, as a gain gate resolved by the same clock the pattern is on
   * (see arm.js). The wait here only decides when the buffer catches up with
   * what the gate has already done.
   *
   * Blocks are addressed by INDEX and re-resolved after the wait rather than
   * captured up front, for the same reason a rip does: several cycles is
   * seconds of wall clock, and line numbers taken before an edit would name
   * the wrong text by the time the commit lands.
   */
  async function arm(action) {
    const id = pane.getViewedId();
    if (live.getRipping()?.tabId === id) {
      status.info('rip in progress');
      return;
    }
    const lines = pane.getCode(id).split('\n');
    // Holding DETAIL VIEW means "the whole page": play or stop everything in
    // this song at once, without having to pin every block first.
    const wholePage = Boolean(getSelectAll?.());
    const selected = wholePage
      ? listBlocks(lines).map((block, index) => ({ ...block, index }))
      : pane.getSelectedBlocks(id);
    if (selected.length === 0) {
      status.info(wholePage ? 'song is empty' : 'no block in selection');
      return;
    }
    // A tab that is not contributing to the render is SILENT, however few of
    // its blocks are commented - nothing outside the active song (and anything
    // held over it) reaches the parser at all. Reading "uncommented" as
    // "playing" is what made play on a second tab report "already playing"
    // for a song nobody could hear.
    const silent = !live.contributingIds().includes(id);
    // Play on a silent tab has work to do even with nothing to uncomment:
    // making that tab the active one is what starts it.
    const needsActivating = action === 'play' && silent;

    const targets = armable(lines, selected, action);
    if (targets.length === 0 && !needsActivating) {
      // Not a failure: pressing play on something already playing is a
      // deliberate no-op, and saying so is more use than silence.
      status.info(`already ${action === 'play' ? 'playing' : 'stopped'}`);
      return;
    }
    const indexes = targets.map((block) => selected.find((s) => s.start === block.start).index);
    const { cycle, cps } = getTransport() ?? { cycle: 0, cps: 1 };
    const cycles = crossfaderCycles(getCrossfader?.());
    // Whole cycles only: the change lands on a bar line, never part way
    // through one. See armTarget.
    const target = armTarget(cycle, cycles);

    const generation = (armGeneration += 1);
    live.setArmed({
      tabId: id,
      blockIndexes: indexes,
      action,
      pressCycle: cycle,
      targetCycle: target,
    });
    // Play must be able to start a stopped transport - that is what the button
    // means. Stop only re-renders: it has nothing to start.
    //
    // A silent tab is the exception: evaluating now would start the tab that
    // IS active, which is a different song from the one the button was
    // pressed on. It waits, and the switch happens at the target.
    await (action === 'play' && !silent ? live.evaluateActive() : live.refresh());
    const waitCycles = target - cycle;
    status.info(
      `${action} ${indexes.length} block(s)${wholePage ? ' (whole page)' : ''} at cycle ${target}`,
    );

    if (waitCycles > 0) {
      await new Promise((resolve) => setTimeout(resolve, (waitCycles / cps) * 1000));
      if (generation !== armGeneration) return; // superseded by a later press
    }

    const current = pane.getCode(id).split('\n');
    const blocks = indexes.map((i) => listBlocks(current)[i]).filter(Boolean);
    if (blocks.length > 0) {
      // `armable` guarantees every target is in the SAME state, which is
      // exactly the condition under which a toggle is a directed set.
      pane.setCode(id, toggleBlocksComment(current, blocks).join('\n'));
    }
    live.setArmed(null);
    if (needsActivating) {
      // The switch IS the play: until this tab is the active one, nothing in
      // it reaches the parser.
      pane.setActiveTab(id);
      await live.evaluateActive();
    } else {
      await live.refresh();
    }
  }

  /**
   * Delete the song on screen, on the crossfader's beat.
   *
   * Timed like an arm rather than done instantly, for the same reason: a song
   * vanishing mid-bar is a hole in the set. The gesture that reaches here is
   * three taps (see createTapGate) - the timing is the musical part, the taps
   * are the part that stops it happening by accident.
   */
  async function deleteTab() {
    const id = pane.getViewedId();
    const name = pane.getName(id) ?? 'song';
    if (pane.getTabs().length < 2) {
      status.info('cannot delete the only tab');
      return;
    }
    const { cycle, cps } = getTransport() ?? { cycle: 0, cps: 1 };
    const target = armTarget(cycle, crossfaderCycles(getCrossfader?.()));
    const waitCycles = target - cycle;
    status.info(`deleting "${name}" at cycle ${target}`);

    if (waitCycles > 0) {
      await new Promise((resolve) => setTimeout(resolve, (waitCycles / cps) * 1000));
    }

    const { closed, wasActive, reason } = pane.closeTab(id);
    if (!closed) {
      status.info(`delete refused: ${reason}`);
      return;
    }
    // Nothing is active any more, and `live` renders the active tab plus
    // whatever is held over it - so with no active tab there is no render to
    // replace what is sounding. Stop, rather than leave the last one ringing.
    if (wasActive) live.stop();
    else await live.refresh();
    status.info(`deleted "${name}"`);
  }

  return {
    /** Triple-tapped UP: remove the song on screen, on the crossfader's beat. */
    deleteTab,
    /** Selected blocks start playing after the crossfader's count of cycles. */
    armPlay: () => arm('play'),
    /** The same countdown, in the other direction. */
    armStop: () => arm('stop'),
    /** 1: park the blocks in the bottom bar's holding tab. */
    ripToReturn: () =>
      rip((text) => pane.appendBlock(returnTabId(), text), RETURN_TAB),
    /** 2: give the blocks a song tab of their own, first in the top bar. */
    ripToNewTab: () =>
      rip((text) => {
        const name = `rip-${pane.getTabs().length + 1}`;
        pane.viewTab(pane.addTab(name, text, { bar: 'top', first: true }));
      }, 'new tab'),
    /** 3: straight into the library, by the same path as the SAVE SONG button. */
    ripToLibrary: () =>
      rip((text) => {
        const saved = panel.saveEntry('songs', `${pane.getName(pane.getViewedId())}-rip`, text);
        if (!saved) status.info('rip discarded (save cancelled)');
      }, 'library'),
    /** 4: the return trip - back into whichever song is currently playing. */
    ripToActive: () =>
      rip((text) => {
        const target = pane.getActiveId();
        if (!target) {
          status.info('no active song to return to');
          return;
        }
        pane.appendBlock(target, text);
      }, 'active song'),
    toggleBlock() {
      const toggled = pane.toggleBlocksInSelection();
      if (!toggled) status.info('no block in selection');
    },
    async setActiveScript() {
      const id = pane.getViewedId();
      pane.setActiveTab(id);
      // Evaluation goes through `live` so anything currently held down (a
      // block, another tab) is part of what gets sent. On failure it has
      // already cleared the outlines, and the engine's onError has already
      // reported the message - don't overwrite that here.
      const { success } = await live.evaluateActive();
      if (!success) return;
      status.info(`active: ${pane.getTabs().find((t) => t.id === id).name}`);
    },
    toggleExplainer() {
      status.info(explainer.toggle());
    },
    hush() {
      // Through `live`, not hushEngine() directly, so the transport is marked
      // stopped as well as silenced. Otherwise the next keystroke in the
      // active song would quietly start it playing again.
      live.stop();
      status.info('hushed');
    },
    nextTab: () => shiftTab(1),
    prevTab: () => shiftTab(-1),
    insertSelectedSnippet() {
      const code = panel.getSelectedSnippetCode();
      if (!code) {
        status.info('no snippet selected');
        return;
      }
      // Same rule as clicking the snippet in the panel - see main.js.
      if (isStandaloneBlock(code)) pane.insertAsBlock(code);
      else pane.insertAtCursor(code);
    },
  };
}
