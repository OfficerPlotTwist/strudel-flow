import { describe, signatureOf, uniqueFunctions } from '../explain.js';
import { functionSpans } from '../changes.js';
import { functionColor } from '../palette.js';

/**
 * The popout carries its own copy of the CRT look. It is deliberately a small
 * standalone sheet rather than an import of crt.css: the popout has no build
 * pipeline of its own (see popout.js), and it only needs the palette plus its
 * own few components.
 */
export const EXPLAINER_CSS = `
:root {
  --phosphor: #7df7a8;
  --phosphor-dim: #3a7d55;
  --bg: #060a07;
  --bg-raised: #0c130e;
  --alert: #f7a87d;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--phosphor);
  font-family: "Consolas", "DejaVu Sans Mono", monospace;
  font-size: 13px;
  height: 100vh;
  display: flex;
  flex-direction: column;
}
body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 3px);
}
.ex-head {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--phosphor-dim);
  color: var(--phosphor-dim);
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}
.ex-head b { color: var(--phosphor); font-weight: normal; }
.ex-detail { padding: 0.75rem; border-bottom: 1px solid var(--phosphor-dim); }
.ex-sig { font-size: 1.25rem; margin: 0 0 0.15rem; font-weight: normal; }
.ex-alias, .ex-pkg { color: var(--phosphor-dim); font-size: 0.85em; }
.ex-desc { margin: 0.5rem 0 0; line-height: 1.5; }
.ex-example {
  margin: 0.6rem 0 0;
  padding: 0.5rem;
  background: var(--bg-raised);
  border-left: 2px solid var(--phosphor-dim);
  white-space: pre-wrap;
  overflow-x: auto;
}
.ex-empty { color: var(--phosphor-dim); padding: 0.75rem; }
.ex-used { overflow-y: auto; flex: 1; }
.ex-used-title {
  padding: 0.5rem 0.75rem 0.25rem;
  color: var(--phosphor-dim);
  position: sticky;
  top: 0;
  background: var(--bg);
}
.ex-list { list-style: none; margin: 0; padding: 0 0 1rem; }
.ex-list li { display: flex; gap: 0.6rem; padding: 0.2rem 0.75rem; cursor: pointer; }
.ex-list li:hover, .ex-list li.pinned { background: var(--bg-raised); }
.ex-list li.at-cursor { color: var(--bg); background: var(--phosphor); }
.ex-list .n { min-width: 8rem; }
.ex-list .d {
  color: var(--phosphor-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ex-list li.at-cursor .d { color: var(--bg); }
.ex-hint { padding: 0.4rem 0.75rem; color: var(--phosphor-dim); border-top: 1px solid var(--phosphor-dim); }
`;

/**
 * Renders "what is this function" for the song that is currently ACTIVE (the
 * one being played), into any container - the popout window's body today, and
 * an in-page pane unchanged if that is ever wanted.
 *
 * Two selection modes, and the distinction matters: by default the detail
 * pane follows the caret, so reading the song narrates itself as you move
 * through it. Clicking an entry PINS it, which is what you want while
 * actually editing - the explanation stays put instead of chasing the caret
 * you are typing with. Clicking the pinned entry again releases it.
 */
export function createExplainer(container, { doc = document } = {}) {
  let pinned = null;

  const head = doc.createElement('div');
  head.className = 'ex-head';
  const songLabel = doc.createElement('span');
  const modeLabel = doc.createElement('span');
  head.append(songLabel, modeLabel);

  const detail = doc.createElement('div');
  detail.className = 'ex-detail';

  const used = doc.createElement('div');
  used.className = 'ex-used';

  const hint = doc.createElement('div');
  hint.className = 'ex-hint';
  hint.textContent = 'click to pin · click again to follow the cursor';

  container.append(head, detail, used, hint);

  function renderDetail(name) {
    detail.innerHTML = '';
    const info = name ? describe(name) : null;
    if (!info) {
      const empty = doc.createElement('p');
      empty.className = 'ex-empty';
      empty.textContent = name
        ? `"${name}" is not in the Strudel docs`
        : 'no function at the cursor';
      detail.append(empty);
      return;
    }

    const sig = doc.createElement('h2');
    sig.className = 'ex-sig';
    sig.textContent = signatureOf(info);
    // Same colour this function has in the editor, so the eye can jump
    // between the two screens without re-reading the name.
    sig.style.color = functionColor(name, liveNames.has(name));
    detail.append(sig);

    if (info.isAlias) {
      const alias = doc.createElement('div');
      alias.className = 'ex-alias';
      alias.textContent = `alias of ${info.canonical}`;
      detail.append(alias);
    }

    const pkg = doc.createElement('div');
    pkg.className = 'ex-pkg';
    pkg.textContent = `@strudel/${info.package}`;
    detail.append(pkg);

    const desc = doc.createElement('p');
    desc.className = 'ex-desc';
    desc.textContent = info.description;
    detail.append(desc);

    if (info.example) {
      const example = doc.createElement('pre');
      example.className = 'ex-example';
      example.textContent = info.example;
      detail.append(example);
    }
  }

  function renderUsed(code, cursorName, onPick) {
    used.innerHTML = '';
    const title = doc.createElement('div');
    title.className = 'ex-used-title';
    const names = uniqueFunctions(code).map((h) => h.name);
    title.textContent = `USED IN THIS SONG (${names.length})`;
    used.append(title);

    const list = doc.createElement('ul');
    list.className = 'ex-list';
    for (const name of names) {
      const info = describe(name);
      const item = doc.createElement('li');
      if (name === cursorName && !pinned) item.classList.add('at-cursor');
      if (name === pinned) item.classList.add('pinned');

      const n = doc.createElement('span');
      n.className = 'n';
      n.textContent = name;
      // Bright when this function is in a block that is actually playing,
      // the same hue but dim when every use of it is commented out.
      n.style.color = functionColor(name, liveNames.has(name));
      const d = doc.createElement('span');
      d.className = 'd';
      d.textContent = info?.description ?? '';
      item.append(n, d);
      item.addEventListener('click', () => onPick(name));
      list.append(item);
    }
    used.append(list);
  }

  let last = { songName: '', code: '', cursorName: null, subject: null };
  // Which functions are in live blocks - recomputed per paint because
  // commenting a block changes nothing about the code except this.
  let liveNames = new Set();

  function paint() {
    const { songName, code, cursorName, subject } = last;
    liveNames = new Set(
      functionSpans(code)
        .filter((span) => span.live)
        .map((span) => span.name),
    );
    songLabel.innerHTML = '';
    songLabel.append(doc.createTextNode('song: '));
    const b = doc.createElement('b');
    b.textContent = songName || '(none active)';
    songLabel.append(b);
    // Priority: an explicit pin outranks everything, then whatever the last
    // edit touched, and only then the caret. The pin is the whole point of
    // SHIFT - it says "stop moving, I am reading this one".
    const showing = pinned ?? subject?.name ?? cursorName;
    modeLabel.textContent = pinned
      ? `pinned: ${pinned}`
      : subject
        ? `${subject.kind}: ${subject.name}`
        : 'following cursor';
    renderDetail(showing);
    renderUsed(code, showing, (name) => {
      pinned = pinned === name ? null : name;
      paint();
    });
  }

  paint();

  return {
    /**
     * `cursorName` is the function the caret is on; `subject` is whatever the
     * last edit touched, which is what the window shows by default.
     */
    update({ songName, code, cursorName, subject = null }) {
      last = { songName, code, cursorName, subject };
      paint();
    },
    /** SHIFT: hold this function on screen, or let go of it. */
    togglePin(name) {
      const target = name ?? last.subject?.name ?? last.cursorName;
      if (!target) return null;
      pinned = pinned === target ? null : target;
      paint();
      return pinned;
    },
    pinnedName: () => pinned,
    /** Release a pin whose function no longer appears in any live block. */
    releaseIfMuted() {
      if (!pinned || liveNames.has(pinned)) return false;
      pinned = null;
      paint();
      return true;
    },
  };
}
