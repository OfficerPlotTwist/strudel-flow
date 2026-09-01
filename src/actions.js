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
      await evaluateCode(pane.getCode(id));
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
