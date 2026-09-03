import { listBlocks, uncommentForPlayback } from './blocks.js';
import { evaluateCode, hushEngine } from './engine.js';
import { applyFade, unshiftLocations } from './rip.js';

/** Blank line between tabs, so two songs can never fuse into one statement. */
const JOIN = '\n\n';

/**
 * The single path from "what is in the editor" to "what the parser is running".
 *
 * The buffer is no longer the whole story, in two ways, and both are
 * momentary - held down, never written to the document:
 *
 *   - block holds  : make individual commented blocks of the active song live
 *   - tab holds    : ADD folds another tab's song into the mix; SOLO plays
 *                    only the held tabs and suppresses everything else
 *
 * So the source sent to Strudel is a *render*: a concatenation of the
 * contributing tabs, each with its own held blocks uncommented. Every
 * re-evaluation goes through here - a path that called
 * evaluateCode(pane.getCode(id)) directly would silently drop whatever is
 * being held at that moment.
 */
export function createLive({ pane }) {
  const heldBlocks = new Set(); // block indexes into the ACTIVE tab
  const heldAdd = new Set(); // tab ids folded in while held
  const heldSolo = new Set(); // tab ids that suppress everything else
  // The in-flight rip, or null: which tab's blocks are fading out and from
  // which cycle. Unlike the holds above it is not momentary - it survives the
  // key release and ends when the blocks are removed from the document.
  let ripping = null; // { tabId, blockIndexes: number[], cycle }
  // Is the transport running? The app boots into silence and stays there until
  // something is deliberately triggered, so there has to be a difference
  // between "play this" and "the thing that is playing changed". Without it,
  // the edit listener would start the whole song the first time a Ctrl+M
  // toggled a comment - and would restart it after every Ctrl+.
  let running = false;

  /**
   * Which tabs feed the parser right now, in tab order.
   *
   * SOLO is exclusive by definition: while any solo key is down the active tab
   * has no special status, which is the whole point of being able to audition
   * one part of the set against silence.
   */
  function contributingIds() {
    const order = pane.getTabs().map((t) => t.id);
    if (heldSolo.size) return order.filter((id) => heldSolo.has(id));
    const activeId = pane.getActiveId();
    return order.filter((id) => id === activeId || heldAdd.has(id));
  }

  /**
   * One tab's source, with its held blocks made live and any ripping blocks
   * fading out. Returns the text plus the insertions the fade made, because
   * unlike everything else here the fade is NOT length-preserving.
   */
  function renderTab(id) {
    let lines = pane.getCode(id).split('\n');
    // Block holds address the active song's blocks; they are the performer's
    // fingers on THIS song, not an index that would mean something different
    // in every other tab.
    if (id === pane.getActiveId() && heldBlocks.size > 0) {
      const blocks = listBlocks(lines);
      const unmuted = [...heldBlocks].map((index) => blocks[index]).filter(Boolean);
      lines = uncommentForPlayback(lines, unmuted);
    }
    if (ripping && ripping.tabId === id) {
      const blocks = listBlocks(lines);
      const doomed = ripping.blockIndexes.map((index) => blocks[index]).filter(Boolean);
      const faded = applyFade(lines, doomed, ripping.cycle);
      return { text: faded.lines.join('\n'), edits: faded.edits };
    }
    return { text: lines.join('\n'), edits: [] };
  }

  /**
   * The exact string handed to the parser, plus where each tab's text starts
   * in it. The offsets are what let a single flat miniLocations array from the
   * transpiler be split back across the tabs it came from.
   */
  function renderSource() {
    const segments = [];
    let base = 0;
    let out = '';
    for (const id of contributingIds()) {
      const { text, edits } = renderTab(id);
      if (out) {
        out += JOIN;
        base += JOIN.length;
      }
      out += text;
      segments.push({ id, base, length: text.length, edits });
      base += text.length;
    }
    return { code: out, segments };
  }

  /**
   * Hands each contributing tab only the locations that fall inside its own
   * segment, rebased to that tab's own offsets. Tabs that are not playing get
   * an empty set, so nothing is left outlined as if it were still sounding.
   */
  function distributeLocations(segments, locations) {
    const contributing = new Set(segments.map((s) => s.id));
    for (const { id, base, length, edits } of segments) {
      const mine = (locations ?? [])
        .filter(([from, to]) => from >= base && to <= base + length)
        .map(([from, to]) => [from - base, to - base]);
      // A fade adds characters this tab's buffer does not have, so offsets
      // after it would land three-dozen characters too far right. Undo the
      // insertions before the highlights are painted over the real document.
      pane.setMiniLocations(id, unshiftLocations(mine, edits ?? []));
    }
    for (const tab of pane.getTabs()) {
      if (contributing.has(tab.id)) continue;
      pane.setMiniLocations(tab.id, []);
      pane.clearHighlight(tab.id);
    }
  }

  // Hold keys can fire faster than a parse completes (a quick stab on a pad,
  // or press-and-release inside one evaluation). Overlapping evaluate() calls
  // would resolve out of order and could leave the LAST-started render losing
  // to an earlier one, so the scheduler ends up playing something nobody is
  // holding. Serialise them: each render starts only once the previous
  // finished, and each reads the held state fresh at that moment.
  let queue = Promise.resolve();

  async function runEvaluation() {
    const { code, segments } = renderSource();
    if (segments.length === 0) return { success: false };
    // An empty render is a legitimate state, not a failure: rip out every
    // block, or comment the whole song, and there is genuinely nothing to
    // play. Strudel throws "no code to evaluate" on a blank string, so stop
    // the transport instead and report success - silence is the correct
    // outcome here, and an error strip would be a lie.
    if (!code.trim()) {
      hushEngine();
      // Nothing left to play. Stop, and stay stopped: re-typing a pattern
      // should not resurrect the transport on its own.
      running = false;
      distributeLocations(segments, []);
      return { success: true };
    }
    const { success, miniLocations } = await evaluateCode(code);
    // On failure, show no outline anywhere rather than stale offsets from the
    // last good render - which, with tab holds, may describe a different set
    // of tabs entirely. The error itself is already on the status strip.
    distributeLocations(segments, success ? miniLocations : []);
    return { success };
  }

  /**
   * Play what is currently rendered. This is the DELIBERATE path - Ctrl+Enter,
   * a hold key, a MIDI pad - and it always evaluates, starting the transport
   * if it was stopped.
   */
  function evaluateActive() {
    running = true;
    queue = queue.then(runEvaluation, runEvaluation);
    return queue;
  }

  /**
   * Re-render because the source changed. This is the INCIDENTAL path, and it
   * is a no-op while stopped: editing a silent song is just editing, and must
   * not be what starts the room hearing it.
   */
  function refresh() {
    if (!running) return Promise.resolve({ success: true, skipped: true });
    return evaluateActive();
  }

  /**
   * Press/release for the momentary keys. Returns true only when the held set
   * actually changed, so callers can skip a redundant re-evaluation: keydown
   * autorepeats continuously while a key is down, and re-parsing the whole set
   * at the keyboard repeat rate would stutter the audio.
   */
  function setHeld(set, key, isDown) {
    const had = set.has(key);
    if (isDown === had) return false;
    if (isDown) set.add(key);
    else set.delete(key);
    return true;
  }

  return {
    renderSource,
    evaluateActive,
    refresh,
    isRunning: () => running,
    /** Stop the transport and stay stopped until deliberately triggered again. */
    stop() {
      running = false;
      hushEngine();
    },
    contributingIds,
    heldBlockIndexes: () => [...heldBlocks].sort((a, b) => a - b),
    isTabHeld: (id) => heldAdd.has(id) || heldSolo.has(id),
    setBlockHeld: (blockIndex, isDown) => setHeld(heldBlocks, blockIndex, isDown),
    /**
     * Start (or clear, with null) the fade-out half of a rip. One rip at a
     * time: a second press while one is in flight replaces it rather than
     * layering two ramps over the same blocks.
     */
    setRipping(next) {
      ripping = next;
    },
    getRipping: () => ripping,
    setTabHeld(tabId, mode, isDown) {
      return setHeld(mode === 'solo' ? heldSolo : heldAdd, tabId, isDown);
    },
    /**
     * Drops every hold. Needed because a key released while the window is not
     * focused never delivers a keyup here - without this, a block or a whole
     * tab would stay stuck on after alt-tabbing away mid-hold.
     */
    releaseAll() {
      const changed = heldBlocks.size || heldAdd.size || heldSolo.size;
      heldBlocks.clear();
      heldAdd.clear();
      heldSolo.clear();
      return Boolean(changed);
    },
  };
}
