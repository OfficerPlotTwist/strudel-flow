import { functionAt } from '../explain.js';
import { createExplainer, EXPLAINER_CSS } from './explainer.js';
import { openPopout } from './popout.js';

/**
 * Owns the explainer popout's lifetime and feeds it the state it needs. The
 * explainer itself is a dumb renderer; deciding WHAT to describe lives here.
 *
 * It describes the ACTIVE tab - the song actually playing - not the viewed
 * one, so it keeps narrating the running pattern while you browse another tab.
 */
export function createExplainerWindow(pane) {
  let popout = null;
  let explainer = null;

  function snapshot() {
    const activeId = pane.getActiveId() ?? pane.getViewedId();
    if (!activeId) return { songName: '', code: '', cursorName: null };
    const code = pane.getCode(activeId);
    // A caret position only refers to this code when the active tab is also
    // the one on screen; on any other tab the caret is in different text and
    // its offset would name an unrelated function.
    const cursorPos = pane.getViewedId() === activeId ? pane.getCursorPos(activeId) : null;
    const hit = cursorPos == null ? null : functionAt(code, cursorPos);
    return { songName: pane.getName(activeId) ?? '', code, cursorName: hit?.name ?? null };
  }

  function refresh() {
    if (!popout?.isOpen()) return;
    explainer.update(snapshot());
  }

  function drop() {
    popout = null;
    explainer = null;
  }

  /**
   * Opens the window if it is not already open. Returns a status line.
   *
   * MUST be called from inside a user gesture. `window.open` outside one is
   * silently refused by every browser, so the boot click is the only moment
   * the app can raise this window on its own - anything later (a timer, a load
   * event) is blocked and reports a popup failure the user did nothing to
   * cause.
   */
  function open({ focusIt = true } = {}) {
    if (popout?.isOpen()) return 'explainer already open';
    popout = openPopout({ title: 'Function explainer', css: EXPLAINER_CSS });
    if (!popout) {
      drop();
      return 'explainer blocked - allow popups for this page';
    }
    explainer = createExplainer(popout.body, { doc: popout.document });
    popout.onClose(drop);
    refresh();
    // At boot the editor must keep the keyboard: an explainer that steals
    // focus on launch means the first thing typed goes into a window that
    // does not accept typing.
    if (focusIt) popout.focus();
    return 'explainer opened (Ctrl+e)';
  }

  return {
    refresh,
    open,
    isOpen: () => Boolean(popout?.isOpen()),
    /** Opens or closes the window; returns a line for the status strip. */
    toggle() {
      if (popout?.isOpen()) {
        popout.close();
        drop();
        return 'explainer closed';
      }
      return open();
    },
  };
}
