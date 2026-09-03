import { getTransport } from './engine.js';
import { isStandaloneBlock, listBlocks } from './blocks.js';
import { extractBlocks, removeBlocks, RIP_CYCLES } from './rip.js';

/** The bottom-bar tab ripped material is parked in. Created on first use. */
const RETURN_TAB = 'to return';

export function createActions({ pane, panel, status, live, explainer }) {
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

  return {
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
