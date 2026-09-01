import { evaluateCode, hushEngine } from './engine.js';

export function createActions({ pane, panel, status }) {
  function shiftTab(delta) {
    const tabs = pane.getTabs();
    if (tabs.length < 2) return;
    const index = tabs.findIndex((t) => t.id === pane.getViewedId());
    const next = (index + delta + tabs.length) % tabs.length;
    pane.viewTab(tabs[next].id);
  }

  return {
    toggleBlock() {
      const toggled = pane.toggleBlockAtCursor();
      if (!toggled) status.info('no block at cursor');
    },
    async setActiveScript() {
      const id = pane.getViewedId();
      pane.setActiveTab(id);
      const { success, miniLocations } = await evaluateCode(pane.getCode(id));
      if (success) {
        pane.setMiniLocations(id, miniLocations);
      } else {
        // Evaluation failed on the tab we just activated: it must show no
        // outline (not stale offsets from its own last-good eval), but
        // onError (wired in main.js) has already reported it to the status
        // strip - don't overwrite that here.
        pane.clearHighlight(id);
        return;
      }
      status.info(`active: ${pane.getTabs().find((t) => t.id === id).name}`);
    },
    hush() {
      hushEngine();
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
      pane.insertAtCursor(code);
    },
  };
}
