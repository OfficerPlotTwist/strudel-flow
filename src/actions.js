import { getTransport } from './engine.js';
import { isStandaloneBlock, listBlocks, toggleBlocksComment } from './blocks.js';
import { extractBlocks, removeBlocks, RIP_CYCLES } from './rip.js';
import { armable, crossfaderCycles } from './arm.js';

/** The bottom-bar tab ripped material is parked in. Created on first use. */
const RETURN_TAB = 'to return';

export function createActions({ pane, panel, status, live, explainer, getCrossfader }) {
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
    const selected = pane.getSelectedBlocks(id);
    if (selected.length === 0) {
      status.info('no block in selection');
      return;
    }
    const lines = pane.getCode(id).split('\n');
    const targets = armable(lines, selected, action);
    if (targets.length === 0) {
      // Not a failure: pressing play on something already playing is a
      // deliberate no-op, and saying so is more use than silence.
      status.info(`already ${action === 'play' ? 'playing' : 'stopped'}`);
      return;
    }
    const indexes = targets.map((block) => selected.find((s) => s.start === block.start).index);
    const { cycle, cps } = getTransport() ?? { cycle: 0, cps: 1 };
    const cycles = crossfaderCycles(getCrossfader?.());

    const generation = (armGeneration += 1);
    live.setArmed({ tabId: id, blockIndexes: indexes, action, cycles, cycle });
    // Play must be able to start a stopped transport - that is what the button
    // means. Stop only re-renders: it has nothing to start.
    await (action === 'play' ? live.evaluateActive() : live.refresh());
    status.info(
      cycles === 0
        ? `${action} ${indexes.length} block(s)`
        : `${action} ${indexes.length} block(s) in ${cycles} cycle(s)`,
    );

    if (cycles > 0) {
      await new Promise((resolve) => setTimeout(resolve, (cycles / cps) * 1000));
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
    await live.refresh();
  }

  return {
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
