import { functionAt } from '../explain.js';
import { diffCalls } from '../changes.js';
import { createExplainer, EXPLAINER_CSS } from './explainer.js';
import { openPopout } from './popout.js';

/**
 * Owns the explainer popout's lifetime and feeds it the state it needs. The
 * explainer itself is a dumb renderer; deciding WHAT to describe lives here.
 *
 * It describes the ACTIVE tab - the song actually playing - not the viewed
 * one, so it keeps narrating the running pattern while you browse another tab.
 */
/** How long each change holds the window before the next one gets a turn. */
const ROTATE_MS = 5000;

/**
 * How long typing has to stop before the edit counts as finished.
 *
 * Diffing on every keystroke describes the keystroke, not the edit: typing
 * `.fast(2)` reports `fast` as appended for one character and then as retuned
 * for every character after it, so the window settles on the wrong word. Worse,
 * nothing that arrives one character at a time ever produces two changes at
 * once, so the rotation would have had nothing to rotate.
 */
const SETTLE_MS = 500;

export function createExplainerWindow(pane) {
  let popout = null;
  let explainer = null;

  // What the last edit touched. More than one thing can change in a single
  // edit - paste a whole chain and three functions arrive at once - and each
  // is worth reading, so they take turns rather than the last one winning.
  let queue = [];
  let turn = 0;
  let rotateTimer = null;
  // The code as it stood before the current burst of typing - the baseline an
  // edit is measured against, updated only once typing has settled.
  let baselineCode = null;
  let previousId = null;
  let settleTimer = null;

  function stopRotating() {
    if (rotateTimer) clearInterval(rotateTimer);
    rotateTimer = null;
  }

  function startRotating() {
    stopRotating();
    // One change needs no rotation - a timer that re-rendered the same entry
    // every five seconds would only fight the user's scroll position.
    if (queue.length < 2) return;
    rotateTimer = setInterval(() => {
      turn = (turn + 1) % queue.length;
      refresh();
    }, ROTATE_MS);
  }

  function snapshot() {
    const activeId = pane.getActiveId() ?? pane.getViewedId();
    if (!activeId) return { songName: '', code: '', cursorName: null, subject: null };
    const code = pane.getCode(activeId);

    // Only compare within one song. Switching tabs is not an edit, and
    // diffing two different arrangements would report every function in both
    // as brand new.
    if (activeId !== previousId) {
      previousId = activeId;
      baselineCode = code;
      queue = [];
      turn = 0;
      stopRotating();
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = null;
    } else if (code !== baselineCode && !settleTimer) {
      // Wait for the typing to stop, then measure the whole edit at once.
      settleTimer = setTimeout(() => {
        settleTimer = null;
        const settled = pane.getCode(activeId);
        const changed = diffCalls(baselineCode, settled);
        baselineCode = settled;
        if (changed.length > 0) {
          queue = changed;
          turn = 0;
          startRotating();
        }
        refresh();
      }, SETTLE_MS);
    }

    // A caret position only refers to this code when the active tab is also
    // the one on screen; on any other tab the caret is in different text and
    // its offset would name an unrelated function.
    const cursorPos = pane.getViewedId() === activeId ? pane.getCursorPos(activeId) : null;
    const hit = cursorPos == null ? null : functionAt(code, cursorPos);
    return {
      songName: pane.getName(activeId) ?? '',
      code,
      cursorName: hit?.name ?? null,
      subject: queue[turn] ?? null,
    };
  }

  function refresh() {
    if (!popout?.isOpen()) return;
    explainer.update(snapshot());
    // A pin whose function has just been commented out has nothing left to
    // describe that is playing, so it lets go on its own - one of the two
    // ways SHIFT ends, the other being SHIFT again.
    if (explainer.releaseIfMuted()) explainer.update(snapshot());
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
    /**
     * SHIFT: hold the function currently on screen there, ignoring the
     * rotation, until SHIFT again or its block stops playing.
     */
    togglePin() {
      if (!popout?.isOpen()) return null;
      const pinned = explainer.togglePin();
      // A pinned window has nothing to rotate to; resuming is what unpinning
      // is for.
      if (pinned) stopRotating();
      else startRotating();
      return pinned;
    },
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
