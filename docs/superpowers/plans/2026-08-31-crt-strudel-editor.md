# CRT Strudel Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A CRT-styled browser editor for Strudel with a snippet/song library, multiple song-script tabs, hotkey and MIDI-in block muting, and pattern MIDI streaming to loopMIDI.

**Architecture:** A static Vite app. One shared Strudel engine from `@strudel/web` drives audio and MIDI; multiple self-managed CodeMirror 6 views hold song scripts, exactly one of which is "active" (evaluated). Pure logic (block detection, library model, trigger matching) is unit-tested with Vitest; engine, MIDI, and UI behavior is verified manually in a browser, which is where the real failure modes live.

**Tech Stack:** Vite, vanilla ES modules (no framework), CodeMirror 6, `@strudel/web` 1.3.0, `@strudel/midi` 1.3.0, `@strudel/codemirror` 1.3.0, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-crt-strudel-editor-design.md`

## Global Constraints

- **Pin exact versions.** `@strudel/web@1.3.0`, `@strudel/midi@1.3.0`, `@strudel/codemirror@1.3.0`, `@codemirror/state@^6.5.1`, `@codemirror/view@^6.36.2`, `@codemirror/lang-javascript@^6.2.2`. `@strudel/core` resolves transitively to 1.2.6 — do **not** add it as a direct dependency or force-align it.
- **Canonical upstream repo is `https://codeberg.org/uzu/strudel`.** The `tidalcycles/strudel` GitHub repo is a stale mirror; do not consult it for API details.
- **`initStrudel()` is called at page load, before any user gesture.** Never inside a click handler.
- **`@strudel/webaudio` is imported statically**, never lazily — it registers a worklet as a module-level side effect.
- **No bare globals of our own.** `evalScope` writes ~1000 names to `globalThis` (`all`, `each`, `run`, `rev`, `id`, `pick`, `slider`, `speed`, …). All app code lives in ES modules and imports what it needs.
- **All paths in code use forward slashes and no drive letters.** LF line endings (`.gitattributes` already set).
- **Never evaluate on keystroke.** Evaluation happens only on set-active or on a block toggle in the active tab.
- Sound is optional in tests: pure-logic modules must not import `@strudel/*` so Vitest can run them headlessly.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json`, `vite.config.js`, `index.html` | Scaffold, dev server, CSP-safe page shell |
| `src/main.js` | Boot sequence and wiring; the only file that knows about all others |
| `src/engine.js` | Strudel init, evaluate, hush, error callbacks |
| `src/midi.js` | Web MIDI enable, output/input enumeration, port selection |
| `src/blocks.js` | Pure: find block at cursor, detect/toggle comment state |
| `src/library.js` | Pure: snippet/song entry model, add/overwrite/promote |
| `src/storage.js` | localStorage read/write + JSON export/import |
| `src/editor.js` | CodeMirror tab manager; active-tab concept |
| `src/crt-theme.js` | CodeMirror 6 theme extension (phosphor palette) |
| `src/triggers.js` | Pure: trigger map, key/MIDI event → trigger id matching |
| `src/actions.js` | Action handlers wired to engine + editor + library |
| `src/ui/boot.js` | CRT power-on screen (audio unlock gesture) |
| `src/ui/panel.js` | Library panel (Snippets / Songs tabs) |
| `src/ui/settings.js` | MIDI port pickers, trigger map editor |
| `src/ui/status.js` | Error strip + MIDI connection indicator |
| `src/styles/crt.css` | Scanlines, vignette, phosphor palette, layout |
| `tests/*.test.js` | Vitest suites for the pure modules |

---

## Task 1: Scaffold + audible sound milestone

**This is the gate.** No other task starts until a pattern is audibly playing. The characteristic failure mode is silence with no error, so proving the engine works first means later silence has exactly one new variable in it.

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.js`, `src/engine.js`, `src/ui/boot.js`, `src/styles/crt.css`

**Interfaces:**
- Consumes: nothing
- Produces: `initEngine({ onError }) -> Promise<void>`, `evaluateCode(code) -> Promise<void>`, `hushEngine() -> void`, `unlockAudio() -> Promise<void>` from `src/engine.js`; `showBootScreen(onEnter) -> void` from `src/ui/boot.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "crt-strudel-editor",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@codemirror/lang-javascript": "^6.2.2",
    "@codemirror/state": "^6.5.1",
    "@codemirror/view": "^6.36.2",
    "@strudel/codemirror": "1.3.0",
    "@strudel/midi": "1.3.0",
    "@strudel/web": "1.3.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes without peer-dependency errors. Confirm `node_modules/@strudel/web/package.json` shows `"version": "1.3.0"`.

- [ ] **Step 3: Create `vite.config.js`**

No worklet plugin or `assetsInclude` is needed — Strudel's worklets ship inlined as `data:` URIs.

```js
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, open: false },
});
```

- [ ] **Step 4: Create `index.html`**

Do **not** add a `Content-Security-Policy` meta tag. Strudel requires `unsafe-eval` (`@strudel/core` uses `new Function`) and `data:` in `script-src` (worklets); a restrictive CSP kills evaluation and silently kills worklets.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CRT Strudel</title>
    <link rel="stylesheet" href="/src/styles/crt.css" />
  </head>
  <body>
    <div id="boot"></div>
    <main id="app" hidden>
      <section id="editor-pane"></section>
      <aside id="library-pane"></aside>
      <div id="status-strip"></div>
    </main>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `src/styles/crt.css`**

```css
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
  height: 100vh;
  overflow: hidden;
}

/* Scanline + vignette overlay, non-interactive */
body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  background:
    repeating-linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.22) 0px,
      rgba(0, 0, 0, 0.22) 1px,
      transparent 1px,
      transparent 3px
    ),
    radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.65) 100%);
}

#boot {
  position: fixed;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 1rem;
  text-align: center;
  cursor: pointer;
  z-index: 100;
  background: var(--bg);
}

#boot h1 { font-weight: normal; letter-spacing: 0.4em; }
#boot p { color: var(--phosphor-dim); }

main {
  display: grid;
  grid-template-columns: 1fr 22rem;
  grid-template-rows: 1fr auto;
  grid-template-areas: "editor library" "status status";
  height: 100vh;
}

#editor-pane { grid-area: editor; overflow: hidden; }
#library-pane { grid-area: library; border-left: 1px solid var(--phosphor-dim); overflow-y: auto; }
#status-strip {
  grid-area: status;
  border-top: 1px solid var(--phosphor-dim);
  padding: 0.25rem 0.75rem;
  font-size: 0.8rem;
  min-height: 1.75rem;
  white-space: pre-wrap;
}
#status-strip.error { color: var(--alert); }
```

- [ ] **Step 6: Create `src/engine.js`**

`evaluate()` swallows errors — it logs, calls `onEvalError`, and returns `undefined` rather than throwing. Errors must therefore be captured through the callback, not a try/catch.

```js
// Static import: @strudel/webaudio registers a worklet as a module-level
// side effect. A lazy import after the first mousedown misses the worklet load.
import { getAudioContext, initAudioOnFirstClick } from '@strudel/webaudio';
import { initStrudel, evaluate, hush, samples } from '@strudel/web';
import '@strudel/midi';

let ready = null;

/**
 * Must be called at page load, BEFORE any user gesture. initStrudel registers
 * the document mousedown listener that unlocks audio; calling it from inside a
 * click handler spends the first click and requires a second one.
 */
export function initEngine({ onError } = {}) {
  ready = initStrudel({
    onEvalError: (err) => onError?.(String(err?.message ?? err)),
    prebake: async () => {
      // initStrudel loads NO samples by default: note(...) works, but
      // s("bd sd") is silent with only a log line. Load dirt-samples so
      // patterns pasted from strudel.cc make sound here.
      await samples('github:tidalcycles/dirt-samples');
    },
  });
  return ready;
}

/** Resume the AudioContext. Call from the boot screen's click handler. */
export async function unlockAudio() {
  await initAudioOnFirstClick();
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  await ready;
}

/** Replace whatever is playing with `code`. Replace semantics are the default. */
export async function evaluateCode(code) {
  await ready;
  await evaluate(code);
}

export function hushEngine() {
  hush();
}
```

- [ ] **Step 7: Create `src/ui/boot.js`**

```js
export function showBootScreen(onEnter) {
  const boot = document.getElementById('boot');
  boot.innerHTML = `
    <h1>CRT STRUDEL</h1>
    <p>click to power on</p>
  `;
  boot.addEventListener(
    'click',
    async () => {
      boot.querySelector('p').textContent = 'warming up...';
      await onEnter();
      boot.remove();
      document.getElementById('app').hidden = false;
    },
    { once: true },
  );
}
```

- [ ] **Step 8: Create `src/main.js` (temporary milestone version)**

This version exists only to prove the engine works. Task 5 replaces the body.

```js
import { evaluateCode, initEngine, unlockAudio } from './engine.js';
import { showBootScreen } from './ui/boot.js';

// Called before the gesture, on purpose. See engine.js.
initEngine({ onError: (msg) => console.error('[eval]', msg) });

showBootScreen(async () => {
  await unlockAudio();
  // MILESTONE PROBE: synth path (no samples) and sample path (needs prebake).
  await evaluateCode('$: note("<c a f e>(3,8)").jux(rev)\n$: s("bd sd")');
});
```

- [ ] **Step 9: Run the dev server and verify audible sound**

Run: `npm run dev`
Then open `http://localhost:5173` in Chrome and click the boot screen.

Expected, and all three must hold:
1. A melodic pattern is **audible** (proves the synth path and the AudioContext unlock).
2. A drum pattern is **audible** (proves `prebake`/`samples` loaded).
3. The console shows **no** `could not load AudioWorklet effects` warning.

If silent, work the spec's failure list in order: was `initStrudel()` called before the gesture; is `@strudel/webaudio` statically imported; did `samples()` resolve.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vite.config.js index.html src/
git commit -m "feat: scaffold Vite app with verified audible Strudel engine"
```

---

## Task 2: MIDI output to loopMIDI

**Files:**
- Create: `src/midi.js`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `initEngine`, `unlockAudio`, `evaluateCode` from `src/engine.js`
- Produces: `enableMidi() -> Promise<boolean>`, `listOutputs() -> string[]`, `listInputs() -> string[]`, `onMidiMessage(portName, handler) -> void` from `src/midi.js`

- [ ] **Step 1: Create `src/midi.js`**

`enableWebMidi()` is idempotent and always requests sysex, so the permission prompt happens once, at boot.

```js
import { WebMidi, enableWebMidi } from '@strudel/midi';

let enabled = false;

/** Returns true if Web MIDI is available and permission was granted. */
export async function enableMidi() {
  if (enabled) return true;
  if (typeof navigator.requestMIDIAccess !== 'function') return false;
  try {
    await enableWebMidi();
    enabled = true;
    return true;
  } catch (err) {
    console.warn('[midi] enable failed', err);
    return false;
  }
}

export function listOutputs() {
  return enabled ? WebMidi.outputs.map((o) => o.name) : [];
}

export function listInputs() {
  return enabled ? WebMidi.inputs.map((i) => i.name) : [];
}

/** Subscribe to raw MIDI messages from a named input port. */
export function onMidiMessage(portName, handler) {
  const input = WebMidi.inputs.find((i) => i.name.includes(portName));
  if (!input) {
    console.warn(`[midi] input "${portName}" not found`);
    return;
  }
  input.addListener('midimessage', (e) => handler(e.message.data));
}
```

- [ ] **Step 2: Extend the milestone probe in `src/main.js`**

Replace the `showBootScreen` call with:

```js
import { enableMidi, listOutputs } from './midi.js';

showBootScreen(async () => {
  await unlockAudio();
  const ok = await enableMidi();
  console.log('[midi] enabled:', ok, 'outputs:', listOutputs());
  const port = listOutputs().find((n) => n.includes('loopMIDI'));
  await evaluateCode(
    port
      ? `$: note("c e g").midichan(1).midi('${port}')`
      : '$: note("<c a f e>(3,8)")',
  );
});
```

- [ ] **Step 3: Verify MIDI reaches loopMIDI**

Run: `npm run dev`, click boot, accept the MIDI permission prompt.

Expected:
1. Console logs `[midi] enabled: true` and an outputs array **containing the loopMIDI port name**.
2. No `[midi] midiport "..." not found!` line.
3. The loopMIDI window's counters increment while the pattern plays.

If the port is absent from the array, loopMIDI is not running — start it and reload. Name matching is substring and **case-sensitive**.

- [ ] **Step 4: Commit**

```bash
git add src/midi.js src/main.js
git commit -m "feat: enumerate Web MIDI ports and verify output to loopMIDI"
```

---

## Task 3: Block model (pure logic, TDD)

**Files:**
- Create: `src/blocks.js`, `tests/blocks.test.js`

**Interfaces:**
- Consumes: nothing (no `@strudel/*` imports — must run headlessly)
- Produces: `findBlock(lines, cursorLine) -> {start, end} | null`, `isBlockCommented(lines, start, end) -> boolean`, `toggleBlockComment(lines, start, end) -> string[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/blocks.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { findBlock, isBlockCommented, toggleBlockComment } from '../src/blocks.js';

const script = [
  'setcps(0.5)',
  '',
  '$: s("bd sd")',
  '  .gain(0.8)',
  '',
  '$: note("c e g")',
];

describe('findBlock', () => {
  it('returns the contiguous non-blank run around the cursor', () => {
    expect(findBlock(script, 3)).toEqual({ start: 2, end: 3 });
  });

  it('handles a single-line block', () => {
    expect(findBlock(script, 0)).toEqual({ start: 0, end: 0 });
  });

  it('extends to the end of the file', () => {
    expect(findBlock(script, 5)).toEqual({ start: 5, end: 5 });
  });

  it('returns null when the cursor is on a blank line', () => {
    expect(findBlock(script, 1)).toBeNull();
  });

  it('treats whitespace-only lines as blank', () => {
    expect(findBlock(['a', '   ', 'b'], 1)).toBeNull();
  });
});

describe('isBlockCommented', () => {
  it('is false when any line is uncommented', () => {
    expect(isBlockCommented(['// a', 'b'], 0, 1)).toBe(false);
  });

  it('is true when every line is commented', () => {
    expect(isBlockCommented(['// a', '// b'], 0, 1)).toBe(true);
  });
});

describe('toggleBlockComment', () => {
  it('comments an uncommented block, preserving indentation', () => {
    expect(toggleBlockComment(script, 2, 3)).toEqual([
      'setcps(0.5)',
      '',
      '// $: s("bd sd")',
      '  // .gain(0.8)',
      '',
      '$: note("c e g")',
    ]);
  });

  it('restores a commented block exactly', () => {
    const commented = toggleBlockComment(script, 2, 3);
    expect(toggleBlockComment(commented, 2, 3)).toEqual(script);
  });

  it('comments a partially commented block rather than restoring it', () => {
    expect(toggleBlockComment(['// a', 'b'], 0, 1)).toEqual(['// // a', '// b']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/blocks.test.js`
Expected: FAIL — `Failed to resolve import "../src/blocks.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/blocks.js`:

```js
const isBlank = (line) => line.trim() === '';
const COMMENT = '// ';

/**
 * A block is the run of contiguous non-blank lines containing the cursor.
 * Returns null if the cursor sits on a blank line.
 */
export function findBlock(lines, cursorLine) {
  if (cursorLine < 0 || cursorLine >= lines.length) return null;
  if (isBlank(lines[cursorLine])) return null;

  let start = cursorLine;
  while (start > 0 && !isBlank(lines[start - 1])) start -= 1;

  let end = cursorLine;
  while (end < lines.length - 1 && !isBlank(lines[end + 1])) end += 1;

  return { start, end };
}

export function isBlockCommented(lines, start, end) {
  for (let i = start; i <= end; i += 1) {
    if (!lines[i].trimStart().startsWith(COMMENT)) return false;
  }
  return true;
}

/**
 * Toggles `// ` on every line of the block, after its leading whitespace so
 * indentation survives a round trip. A partially commented block is commented,
 * not restored — matching editor convention.
 */
export function toggleBlockComment(lines, start, end) {
  const restoring = isBlockCommented(lines, start, end);
  const next = [...lines];
  for (let i = start; i <= end; i += 1) {
    const line = next[i];
    const indent = line.slice(0, line.length - line.trimStart().length);
    const body = line.slice(indent.length);
    next[i] = restoring ? indent + body.slice(COMMENT.length) : indent + COMMENT + body;
  }
  return next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/blocks.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/blocks.js tests/blocks.test.js
git commit -m "feat: add blank-line-delimited block detection and comment toggle"
```

---

## Task 4: Library model and persistence (pure logic, TDD)

**Files:**
- Create: `src/library.js`, `src/storage.js`, `tests/library.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `emptyLibrary() -> Library`, `addEntry(lib, kind, name, code) -> Library`, `removeEntry(lib, kind, id) -> Library`, `findEntry(lib, kind, name) -> Entry | undefined` from `src/library.js`; `loadLibrary(storage) -> Library`, `saveLibrary(storage, lib) -> void`, `exportJson(lib) -> string`, `importJson(text) -> Library` from `src/storage.js`
- `Library` = `{ snippets: Entry[], songs: Entry[] }`; `Entry` = `{ id: string, name: string, code: string }`; `kind` is `'snippets'` or `'songs'`

- [ ] **Step 1: Write the failing tests**

Create `tests/library.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { addEntry, emptyLibrary, findEntry, removeEntry } from '../src/library.js';
import { exportJson, importJson, loadLibrary, saveLibrary } from '../src/storage.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
  };
}

describe('library model', () => {
  it('starts empty in both kinds', () => {
    expect(emptyLibrary()).toEqual({ snippets: [], songs: [] });
  });

  it('adds an entry with a generated id', () => {
    const lib = addEntry(emptyLibrary(), 'snippets', 'kick', 's("bd")');
    expect(lib.snippets).toHaveLength(1);
    expect(lib.snippets[0].name).toBe('kick');
    expect(lib.snippets[0].code).toBe('s("bd")');
    expect(lib.snippets[0].id).toMatch(/\S/);
  });

  it('does not mutate the input library', () => {
    const before = emptyLibrary();
    addEntry(before, 'songs', 'a', 'x');
    expect(before.songs).toHaveLength(0);
  });

  it('keeps kinds independent', () => {
    const lib = addEntry(emptyLibrary(), 'songs', 'set1', 'x');
    expect(lib.snippets).toHaveLength(0);
    expect(lib.songs).toHaveLength(1);
  });

  it('renames the old entry to a backup instead of destroying it', () => {
    let lib = addEntry(emptyLibrary(), 'songs', 'set1', 'old');
    lib = addEntry(lib, 'songs', 'set1', 'new');
    expect(findEntry(lib, 'songs', 'set1').code).toBe('new');
    const backup = lib.songs.find((e) => e.name.startsWith('set1.bak.'));
    expect(backup.code).toBe('old');
  });

  it('removes an entry by id', () => {
    const lib = addEntry(emptyLibrary(), 'snippets', 'kick', 's("bd")');
    expect(removeEntry(lib, 'snippets', lib.snippets[0].id).snippets).toHaveLength(0);
  });
});

describe('storage', () => {
  it('returns an empty library when nothing is stored', () => {
    expect(loadLibrary(fakeStorage())).toEqual(emptyLibrary());
  });

  it('round-trips through storage', () => {
    const storage = fakeStorage();
    const lib = addEntry(emptyLibrary(), 'snippets', 'kick', 's("bd")');
    saveLibrary(storage, lib);
    expect(loadLibrary(storage)).toEqual(lib);
  });

  it('falls back to an empty library on corrupt data', () => {
    const storage = fakeStorage();
    storage.setItem('crt-strudel-library', '{not json');
    expect(loadLibrary(storage)).toEqual(emptyLibrary());
  });

  it('round-trips through export and import', () => {
    const lib = addEntry(emptyLibrary(), 'songs', 'set1', 'x');
    expect(importJson(exportJson(lib))).toEqual(lib);
  });

  it('rejects imported JSON that is not a library', () => {
    expect(() => importJson('[1,2,3]')).toThrow(/not a library/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/library.test.js`
Expected: FAIL — unresolved imports for `../src/library.js` and `../src/storage.js`.

- [ ] **Step 3: Write `src/library.js`**

```js
export const KINDS = ['snippets', 'songs'];

export function emptyLibrary() {
  return { snippets: [], songs: [] };
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function findEntry(lib, kind, name) {
  return lib[kind].find((entry) => entry.name === name);
}

/**
 * Adds an entry. If `name` is taken, the existing entry is renamed to
 * `<name>.bak.<timestamp>` rather than overwritten — saves are never
 * byte-destroying.
 */
export function addEntry(lib, kind, name, code) {
  const existing = findEntry(lib, kind, name);
  const kept = existing
    ? lib[kind].map((entry) =>
        entry.id === existing.id
          ? { ...entry, name: `${name}.bak.${Date.now().toString(36)}` }
          : entry,
      )
    : [...lib[kind]];
  return { ...lib, [kind]: [...kept, { id: newId(), name, code }] };
}

export function removeEntry(lib, kind, id) {
  return { ...lib, [kind]: lib[kind].filter((entry) => entry.id !== id) };
}
```

- [ ] **Step 4: Write `src/storage.js`**

```js
import { emptyLibrary, KINDS } from './library.js';

const KEY = 'crt-strudel-library';

function isLibrary(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    KINDS.every((kind) => Array.isArray(value[kind]))
  );
}

export function loadLibrary(storage) {
  const raw = storage.getItem(KEY);
  if (!raw) return emptyLibrary();
  try {
    const parsed = JSON.parse(raw);
    return isLibrary(parsed) ? parsed : emptyLibrary();
  } catch {
    return emptyLibrary();
  }
}

export function saveLibrary(storage, lib) {
  storage.setItem(KEY, JSON.stringify(lib));
}

export function exportJson(lib) {
  return JSON.stringify(lib, null, 2);
}

export function importJson(text) {
  const parsed = JSON.parse(text);
  if (!isLibrary(parsed)) throw new Error('Imported JSON is not a library');
  return parsed;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/library.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add src/library.js src/storage.js tests/library.test.js
git commit -m "feat: add library model with non-destructive saves and persistence"
```

---

## Task 5: Editor tabs with CRT theme and Strudel highlighting

**Files:**
- Create: `src/crt-theme.js`, `src/editor.js`
- Modify: `src/main.js`, `src/styles/crt.css`

**Interfaces:**
- Consumes: `findBlock`, `toggleBlockComment` from `src/blocks.js`
- Produces: `createEditorPane(container) -> EditorPane` from `src/editor.js`, where `EditorPane` = `{ addTab(name, code) -> string, getTabs() -> {id,name,isActive}[], viewTab(id) -> void, setActiveTab(id) -> void, getViewedId() -> string, getActiveId() -> string|null, getCode(id) -> string, insertAtCursor(text) -> void, toggleBlockAtCursor() -> boolean, onActiveEdit(cb) -> void, updateHighlightLocations(locations) -> void }`

`toggleBlockAtCursor()` returns `true` if a block was toggled, `false` if the cursor was on a blank line.

- [ ] **Step 1: Create `src/crt-theme.js`**

```js
import { EditorView } from '@codemirror/view';

export const crtTheme = EditorView.theme(
  {
    '&': { color: 'var(--phosphor)', backgroundColor: 'transparent', height: '100%' },
    '.cm-content': { fontFamily: 'inherit', caretColor: 'var(--phosphor)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--phosphor)' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--phosphor-dim)',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(125, 247, 168, 0.05)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(125, 247, 168, 0.2)',
    },
    '.cm-scroller': { overflow: 'auto' },
  },
  { dark: true },
);
```

- [ ] **Step 2: Create `src/editor.js`**

Self-managed CodeMirror views, one per tab, sharing `highlightExtension` from `@strudel/codemirror`. `StrudelMirror` is deliberately not used: it owns a repl per editor and writes to a `codemirror-settings` localStorage key.

```js
import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { highlightExtension, updateMiniLocations } from '@strudel/codemirror';
import { findBlock, toggleBlockComment } from './blocks.js';
import { crtTheme } from './crt-theme.js';

export function createEditorPane(container) {
  const tabs = new Map(); // id -> { id, name, view, wrapper }
  const bar = document.createElement('nav');
  bar.className = 'tab-bar';
  const host = document.createElement('div');
  host.className = 'tab-host';
  container.append(bar, host);

  let viewedId = null;
  let activeId = null;
  let editListener = () => {};
  let counter = 0;

  function renderBar() {
    bar.innerHTML = '';
    for (const tab of tabs.values()) {
      const button = document.createElement('button');
      button.textContent = tab.name;
      button.className = 'tab';
      if (tab.id === viewedId) button.classList.add('viewed');
      if (tab.id === activeId) button.classList.add('active');
      button.addEventListener('click', () => viewTab(tab.id));
      bar.append(button);
    }
  }

  function addTab(name, code = '') {
    counter += 1;
    const id = `tab-${counter}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'tab-view';
    wrapper.hidden = true;
    host.append(wrapper);

    const view = new EditorView({
      parent: wrapper,
      state: EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          javascript(),
          highlightExtension,
          crtTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && id === activeId) editListener(id);
          }),
        ],
      }),
    });

    tabs.set(id, { id, name, view, wrapper });
    if (!viewedId) viewTab(id);
    else renderBar();
    return id;
  }

  function viewTab(id) {
    if (!tabs.has(id)) return;
    for (const tab of tabs.values()) tab.wrapper.hidden = tab.id !== id;
    viewedId = id;
    renderBar();
    tabs.get(id).view.focus();
  }

  function currentView() {
    return viewedId ? tabs.get(viewedId).view : null;
  }

  return {
    addTab,
    viewTab,
    getTabs: () =>
      [...tabs.values()].map((t) => ({ id: t.id, name: t.name, isActive: t.id === activeId })),
    setActiveTab(id) {
      if (!tabs.has(id)) return;
      activeId = id;
      renderBar();
    },
    getViewedId: () => viewedId,
    getActiveId: () => activeId,
    getCode: (id) => tabs.get(id).view.state.doc.toString(),
    insertAtCursor(text) {
      const view = currentView();
      if (!view) return;
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, insert: text },
        selection: { anchor: pos + text.length },
      });
      view.focus();
    },
    toggleBlockAtCursor() {
      const view = currentView();
      if (!view) return false;
      const lines = view.state.doc.toString().split('\n');
      const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number - 1;
      const block = findBlock(lines, cursorLine);
      if (!block) return false;
      const next = toggleBlockComment(lines, block.start, block.end).join('\n');
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
      if (viewedId === activeId) editListener(viewedId);
      return true;
    },
    onActiveEdit(cb) {
      editListener = cb;
    },
    updateHighlightLocations(locations) {
      const view = currentView();
      if (view) updateMiniLocations(view, locations);
    },
  };
}
```

- [ ] **Step 3: Install the CodeMirror commands package**

Run: `npm install @codemirror/commands@^6.7.1`
Expected: adds the package used for `history` and `defaultKeymap`.

- [ ] **Step 4: Add tab styles to `src/styles/crt.css`**

Append:

```css
#editor-pane { display: flex; flex-direction: column; }

.tab-bar { display: flex; gap: 1px; border-bottom: 1px solid var(--phosphor-dim); }

.tab {
  background: var(--bg-raised);
  color: var(--phosphor-dim);
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0.4rem 0.9rem;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.tab.viewed { color: var(--phosphor); }
.tab.active {
  border-bottom-color: var(--phosphor);
  text-shadow: 0 0 8px var(--phosphor);
}

.tab-host { flex: 1; position: relative; overflow: hidden; }
.tab-view { position: absolute; inset: 0; }
.tab-view[hidden] { display: none; }
```

- [ ] **Step 5: Wire the pane into `src/main.js`**

Replace the milestone probe body:

```js
import { evaluateCode, initEngine, unlockAudio } from './engine.js';
import { enableMidi } from './midi.js';
import { createEditorPane } from './editor.js';
import { showBootScreen } from './ui/boot.js';

initEngine({ onError: (msg) => console.error('[eval]', msg) });

const pane = createEditorPane(document.getElementById('editor-pane'));
const first = pane.addTab('song-1', '$: s("bd sd")\n\n$: note("<c a f e>(3,8)")');

pane.onActiveEdit((id) => evaluateCode(pane.getCode(id)));

showBootScreen(async () => {
  await unlockAudio();
  await enableMidi();
  pane.setActiveTab(first);
  await evaluateCode(pane.getCode(first));
});
```

- [ ] **Step 6: Verify tabs and live block muting in the browser**

Run: `npm run dev`, open Chrome, click boot.

Expected:
1. The CRT-styled editor shows `song-1` with a glowing active-tab underline, and the pattern plays.
2. Placing the cursor inside the `s("bd sd")` line and running `pane.toggleBlockAtCursor()` from the devtools console comments the block **and the drums stop within about a beat**.
3. Running it again restores the block and the drums return.

Step 2's console call is temporary — Task 7 binds it to a key.

- [ ] **Step 7: Commit**

```bash
git add src/crt-theme.js src/editor.js src/main.js src/styles/crt.css package.json package-lock.json
git commit -m "feat: add CRT-themed CodeMirror tab pane with live block muting"
```

---

## Task 6: Library panel

**Files:**
- Create: `src/ui/panel.js`
- Modify: `src/main.js`, `src/styles/crt.css`

**Interfaces:**
- Consumes: `addEntry`, `removeEntry` from `src/library.js`; `loadLibrary`, `saveLibrary`, `exportJson`, `importJson` from `src/storage.js`; the `EditorPane` from Task 5
- Produces: `createLibraryPanel(container, { onInsert, onSaveSong, getSelectedCode }) -> { refresh() -> void, getSelectedSnippetCode() -> string | null }` from `src/ui/panel.js`

- [ ] **Step 1: Create `src/ui/panel.js`**

```js
import { addEntry, removeEntry } from '../library.js';
import { exportJson, importJson, loadLibrary, saveLibrary } from '../storage.js';

export function createLibraryPanel(container, { onInsert, getSongCode, getSongName }) {
  let lib = loadLibrary(localStorage);
  let kind = 'snippets';
  let selectedId = null;

  function persist() {
    saveLibrary(localStorage, lib);
    refresh();
  }

  function refresh() {
    container.innerHTML = '';

    const tabs = document.createElement('nav');
    tabs.className = 'lib-tabs';
    for (const k of ['snippets', 'songs']) {
      const button = document.createElement('button');
      button.textContent = k.toUpperCase();
      button.className = k === kind ? 'lib-tab viewed' : 'lib-tab';
      button.addEventListener('click', () => {
        kind = k;
        selectedId = null;
        refresh();
      });
      tabs.append(button);
    }

    const list = document.createElement('ul');
    list.className = 'lib-list';
    for (const entry of lib[kind]) {
      const item = document.createElement('li');
      item.className = entry.id === selectedId ? 'lib-item selected' : 'lib-item';

      const name = document.createElement('button');
      name.className = 'lib-name';
      name.textContent = entry.name;
      name.addEventListener('click', () => {
        selectedId = entry.id;
        onInsert(entry.code);
        refresh();
      });

      const promote = document.createElement('button');
      promote.className = 'lib-mini';
      promote.textContent = kind === 'songs' ? '→snip' : '';
      promote.hidden = kind !== 'songs';
      promote.title = 'Copy this song into Snippets';
      promote.addEventListener('click', () => {
        lib = addEntry(lib, 'snippets', entry.name, entry.code);
        persist();
      });

      const del = document.createElement('button');
      del.className = 'lib-mini';
      del.textContent = 'x';
      del.addEventListener('click', () => {
        lib = removeEntry(lib, kind, entry.id);
        persist();
      });

      item.append(name, promote, del);
      list.append(item);
    }

    const actions = document.createElement('div');
    actions.className = 'lib-actions';

    const save = document.createElement('button');
    save.textContent = kind === 'songs' ? 'SAVE SONG' : 'SAVE AS SNIPPET';
    save.addEventListener('click', () => {
      const suggested = kind === 'songs' ? getSongName() : `${getSongName()}-block`;
      const name = window.prompt('Name:', suggested);
      if (!name) return;
      lib = addEntry(lib, kind, name, getSongCode());
      persist();
    });

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'EXPORT';
    exportBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(exportJson(lib));
      exportBtn.textContent = 'COPIED';
      setTimeout(() => (exportBtn.textContent = 'EXPORT'), 1200);
    });

    const importBtn = document.createElement('button');
    importBtn.textContent = 'IMPORT';
    importBtn.addEventListener('click', () => {
      const text = window.prompt('Paste library JSON:');
      if (!text) return;
      try {
        lib = importJson(text);
        persist();
      } catch (err) {
        window.alert(String(err.message));
      }
    });

    actions.append(save, exportBtn, importBtn);
    container.append(tabs, list, actions);
  }

  refresh();

  return {
    refresh,
    getSelectedSnippetCode() {
      const entry = lib.snippets.find((e) => e.id === selectedId);
      return entry ? entry.code : null;
    },
  };
}
```

- [ ] **Step 2: Add panel styles to `src/styles/crt.css`**

Append:

```css
.lib-tabs { display: flex; border-bottom: 1px solid var(--phosphor-dim); }
.lib-tab {
  flex: 1;
  background: var(--bg-raised);
  color: var(--phosphor-dim);
  border: none;
  padding: 0.4rem;
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}
.lib-tab.viewed { color: var(--phosphor); text-shadow: 0 0 8px var(--phosphor); }

.lib-list { list-style: none; margin: 0; padding: 0; }
.lib-item { display: flex; align-items: center; gap: 0.25rem; padding: 0 0.4rem; }
.lib-item.selected { background: rgba(125, 247, 168, 0.1); }
.lib-name {
  flex: 1;
  text-align: left;
  background: none;
  border: none;
  color: var(--phosphor);
  font: inherit;
  font-size: 0.8rem;
  padding: 0.35rem 0;
  cursor: pointer;
}
.lib-mini {
  background: none;
  border: none;
  color: var(--phosphor-dim);
  font: inherit;
  font-size: 0.7rem;
  cursor: pointer;
}
.lib-mini:hover { color: var(--alert); }

.lib-actions { display: flex; flex-wrap: wrap; gap: 0.25rem; padding: 0.5rem 0.4rem; }
.lib-actions button {
  background: var(--bg-raised);
  color: var(--phosphor);
  border: 1px solid var(--phosphor-dim);
  font: inherit;
  font-size: 0.7rem;
  padding: 0.3rem 0.5rem;
  cursor: pointer;
}
```

- [ ] **Step 3: Wire the panel into `src/main.js`**

Add after the `pane` setup:

```js
import { createLibraryPanel } from './ui/panel.js';

const panel = createLibraryPanel(document.getElementById('library-pane'), {
  onInsert: (code) => pane.insertAtCursor(code),
  getSongCode: () => pane.getCode(pane.getViewedId()),
  getSongName: () => pane.getTabs().find((t) => t.id === pane.getViewedId()).name,
});
```

- [ ] **Step 4: Verify the panel in the browser**

Run: `npm run dev`, click boot.

Expected:
1. SAVE AS SNIPPET prompts for a name and the entry appears under SNIPPETS.
2. Clicking a snippet name inserts its code at the editor cursor.
3. Switching to SONGS and saving stores the whole script; `→snip` copies it into SNIPPETS.
4. Saving twice under one name keeps both, the older renamed `<name>.bak.<id>`.
5. After a page reload, all entries are still listed.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panel.js src/main.js src/styles/crt.css
git commit -m "feat: add library panel with snippet insert, song save, and promote"
```

---

## Task 7: Trigger map — hotkeys and MIDI in (TDD for the pure part)

**Files:**
- Create: `src/triggers.js`, `src/actions.js`, `tests/triggers.test.js`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: the `EditorPane` (Task 5), the panel (Task 6), `evaluateCode`/`hushEngine` (Task 1), `onMidiMessage`/`listInputs` (Task 2)
- Produces: `keyEventToTrigger(event) -> string`, `midiDataToTrigger(data) -> string | null`, `defaultTriggerMap() -> Record<string, string>`, `resolveAction(map, trigger) -> string | null` from `src/triggers.js`; `createActions({ pane, panel, status }) -> Record<string, () => void>` from `src/actions.js`

Trigger ids are strings: `key:Ctrl+Enter`, `note:60`, `cc:21`.

- [ ] **Step 1: Write the failing tests**

Create `tests/triggers.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  defaultTriggerMap,
  keyEventToTrigger,
  midiDataToTrigger,
  resolveAction,
} from '../src/triggers.js';

describe('keyEventToTrigger', () => {
  it('encodes a bare key', () => {
    expect(keyEventToTrigger({ key: 'Enter' })).toBe('key:Enter');
  });

  it('encodes modifiers in a fixed order', () => {
    expect(
      keyEventToTrigger({ key: 'Enter', ctrlKey: true, shiftKey: true, altKey: true }),
    ).toBe('key:Ctrl+Alt+Shift+Enter');
  });

  it('normalizes letter case', () => {
    expect(keyEventToTrigger({ key: 'M', ctrlKey: true })).toBe('key:Ctrl+m');
  });
});

describe('midiDataToTrigger', () => {
  it('maps note-on to a note trigger', () => {
    expect(midiDataToTrigger([0x90, 60, 100])).toBe('note:60');
  });

  it('ignores note-on with zero velocity (a note-off in disguise)', () => {
    expect(midiDataToTrigger([0x90, 60, 0])).toBeNull();
  });

  it('ignores note-off', () => {
    expect(midiDataToTrigger([0x80, 60, 64])).toBeNull();
  });

  it('maps a control change to a cc trigger', () => {
    expect(midiDataToTrigger([0xb0, 21, 127])).toBe('cc:21');
  });

  it('ignores a control change with zero value', () => {
    expect(midiDataToTrigger([0xb0, 21, 0])).toBeNull();
  });

  it('matches on any channel', () => {
    expect(midiDataToTrigger([0x95, 60, 100])).toBe('note:60');
    expect(midiDataToTrigger([0xb9, 21, 127])).toBe('cc:21');
  });

  it('ignores other message types', () => {
    expect(midiDataToTrigger([0xf8])).toBeNull();
  });
});

describe('resolveAction', () => {
  it('resolves a mapped trigger', () => {
    expect(resolveAction({ 'key:Ctrl+m': 'toggleBlock' }, 'key:Ctrl+m')).toBe('toggleBlock');
  });

  it('returns null for an unmapped trigger', () => {
    expect(resolveAction({}, 'note:99')).toBeNull();
  });

  it('ships defaults for every documented action', () => {
    const actions = Object.values(defaultTriggerMap());
    for (const name of [
      'toggleBlock',
      'setActiveScript',
      'nextTab',
      'prevTab',
      'hush',
      'insertSelectedSnippet',
    ]) {
      expect(actions).toContain(name);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/triggers.test.js`
Expected: FAIL — `Failed to resolve import "../src/triggers.js"`.

- [ ] **Step 3: Write `src/triggers.js`**

```js
export function keyEventToTrigger(event) {
  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  parts.push(key);
  return `key:${parts.join('+')}`;
}

/**
 * Only rising edges produce triggers: note-on with velocity > 0, and CC with
 * value > 0. Note-off and zero-velocity note-on are ignored so a pad press
 * fires exactly once.
 */
export function midiDataToTrigger(data) {
  const [status, d1, d2] = data;
  const type = status & 0xf0;
  if (type === 0x90 && d2 > 0) return `note:${d1}`;
  if (type === 0xb0 && d2 > 0) return `cc:${d1}`;
  return null;
}

export function defaultTriggerMap() {
  return {
    'key:Ctrl+m': 'toggleBlock',
    'key:Ctrl+Enter': 'setActiveScript',
    'key:Ctrl+.': 'hush',
    'key:Ctrl+ArrowRight': 'nextTab',
    'key:Ctrl+ArrowLeft': 'prevTab',
    'key:Ctrl+i': 'insertSelectedSnippet',
    'note:36': 'toggleBlock',
    'note:37': 'setActiveScript',
    'note:38': 'hush',
    'note:39': 'nextTab',
  };
}

export function resolveAction(map, trigger) {
  return map[trigger] ?? null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/triggers.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 5: Write `src/actions.js`**

```js
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
```

- [ ] **Step 6: Wire triggers into `src/main.js`**

Add after the panel setup:

```js
import { createActions } from './actions.js';
import { defaultTriggerMap, keyEventToTrigger, midiDataToTrigger, resolveAction } from './triggers.js';
import { listInputs, onMidiMessage } from './midi.js';

const triggerMap = defaultTriggerMap();
const actions = createActions({ pane, panel, status });

function dispatch(trigger) {
  const name = resolveAction(triggerMap, trigger);
  if (name) actions[name]();
  return Boolean(name);
}

window.addEventListener('keydown', (event) => {
  if (dispatch(keyEventToTrigger(event))) event.preventDefault();
});
```

And inside the `showBootScreen` callback, after `enableMidi()`:

```js
  for (const input of listInputs()) {
    onMidiMessage(input, (data) => {
      const trigger = midiDataToTrigger(data);
      if (trigger) dispatch(trigger);
    });
  }
```

- [ ] **Step 7: Verify triggers in the browser**

Run: `npm run dev`, click boot.

Expected:
1. `Ctrl+M` with the cursor in a playing block mutes it audibly; pressing again restores it.
2. `Ctrl+M` on a blank line shows `no block at cursor` in the status strip and changes nothing.
3. `Ctrl+Enter` on a second tab moves the glowing active marker and swaps what is playing.
4. `Ctrl+.` stops all sound.
5. With a controller connected, pad note 36 performs the same mute as `Ctrl+M`, firing once per press (not twice — note-off is ignored).

- [ ] **Step 8: Commit**

```bash
git add src/triggers.js src/actions.js tests/triggers.test.js src/main.js
git commit -m "feat: add unified key and MIDI trigger map driving editor actions"
```

---

## Task 8: Status strip and settings panel

**Files:**
- Create: `src/ui/status.js`, `src/ui/settings.js`
- Modify: `src/main.js`, `src/styles/crt.css`

**Interfaces:**
- Consumes: `listOutputs`, `listInputs` from `src/midi.js`; `defaultTriggerMap` from `src/triggers.js`
- Produces: `createStatus(container) -> { info(msg) -> void, error(msg) -> void, setMidi(state) -> void }` from `src/ui/status.js`; `createSettings(container, { triggerMap, onPortChange }) -> void` from `src/ui/settings.js`

- [ ] **Step 1: Create `src/ui/status.js`**

```js
export function createStatus(container) {
  const message = document.createElement('span');
  const midi = document.createElement('span');
  midi.className = 'midi-state';
  midi.textContent = 'MIDI: not connected';
  container.append(message, midi);

  function show(text, isError) {
    message.textContent = text;
    container.classList.toggle('error', isError);
  }

  return {
    info: (msg) => show(msg, false),
    error: (msg) => show(`ERROR: ${msg}`, true),
    setMidi: (state) => {
      midi.textContent = `MIDI: ${state}`;
    },
  };
}
```

- [ ] **Step 2: Create `src/ui/settings.js`**

Port selection is driven from live enumeration, never a typed string: `.midi('name')` matching is substring and case-sensitive, and an unmatched port drops events with only a log line.

```js
import { listInputs, listOutputs } from '../midi.js';

export function createSettings(container, { triggerMap, onPortChange }) {
  const panel = document.createElement('details');
  panel.className = 'settings';
  const summary = document.createElement('summary');
  summary.textContent = 'SETTINGS';
  panel.append(summary);

  const outLabel = document.createElement('label');
  outLabel.textContent = 'MIDI out port ';
  const outSelect = document.createElement('select');
  const outputs = listOutputs();
  if (outputs.length === 0) {
    const option = document.createElement('option');
    option.textContent = '(no outputs found)';
    outSelect.append(option);
    outSelect.disabled = true;
  } else {
    for (const name of outputs) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      if (name.includes('loopMIDI')) option.selected = true;
      outSelect.append(option);
    }
  }
  outSelect.addEventListener('change', () => onPortChange(outSelect.value));
  outLabel.append(outSelect);

  const inList = document.createElement('p');
  inList.className = 'settings-note';
  const inputs = listInputs();
  inList.textContent = inputs.length
    ? `MIDI in: ${inputs.join(', ')}`
    : 'MIDI in: none detected';

  const mapTable = document.createElement('table');
  mapTable.className = 'trigger-map';
  for (const [trigger, action] of Object.entries(triggerMap)) {
    const row = document.createElement('tr');
    const triggerCell = document.createElement('td');
    triggerCell.textContent = trigger;
    const actionCell = document.createElement('td');
    actionCell.textContent = action;
    row.append(triggerCell, actionCell);
    mapTable.append(row);
  }

  panel.append(outLabel, inList, mapTable);
  container.append(panel);
}
```

- [ ] **Step 3: Add settings and status styles to `src/styles/crt.css`**

Append:

```css
#status-strip { display: flex; gap: 1rem; align-items: center; }
#status-strip .midi-state { margin-left: auto; color: var(--phosphor-dim); }

.settings { border-top: 1px solid var(--phosphor-dim); padding: 0.5rem 0.4rem; font-size: 0.75rem; }
.settings summary { cursor: pointer; color: var(--phosphor-dim); }
.settings select {
  background: var(--bg-raised);
  color: var(--phosphor);
  border: 1px solid var(--phosphor-dim);
  font: inherit;
  font-size: 0.75rem;
}
.settings-note { color: var(--phosphor-dim); }
.trigger-map { width: 100%; border-collapse: collapse; color: var(--phosphor-dim); }
.trigger-map td { padding: 0.15rem 0; }
.trigger-map td:last-child { text-align: right; color: var(--phosphor); }
```

- [ ] **Step 4: Wire status and settings into `src/main.js`**

The `status` object is referenced by `createActions` in Task 7, so create it before that call. Final wiring order in `main.js`: `initEngine` → `createStatus` → `createEditorPane` → `createLibraryPanel` → `createActions` → keydown listener → `showBootScreen`.

```js
import { createStatus } from './ui/status.js';
import { createSettings } from './ui/settings.js';

const status = createStatus(document.getElementById('status-strip'));

initEngine({ onError: (msg) => status.error(msg) });
```

And inside the `showBootScreen` callback, after `enableMidi()`:

```js
  const midiOk = await enableMidi();
  status.setMidi(midiOk ? (listOutputs()[0] ?? 'no outputs') : 'not connected');
  let outPort = listOutputs().find((n) => n.includes('loopMIDI')) ?? null;
  createSettings(document.getElementById('library-pane'), {
    triggerMap,
    onPortChange: (name) => {
      outPort = name;
      status.setMidi(name);
    },
  });
```

- [ ] **Step 5: Verify error and status behavior in the browser**

Run: `npm run dev`, click boot.

Expected:
1. Typing deliberately broken code (`$: s("bd`) and pressing `Ctrl+Enter` shows a red `ERROR:` line in the status strip, **audio already playing keeps playing**, and the editor content is untouched.
2. Fixing the code and pressing `Ctrl+Enter` clears the error and applies the change.
3. The status strip's right side reads the selected MIDI port, or `MIDI: not connected` when loopMIDI is not running.
4. SETTINGS expands to show the output picker (loopMIDI preselected when present), detected inputs, and the trigger map table.

- [ ] **Step 6: Run the whole test suite**

Run: `npm test`
Expected: PASS — 34 tests across `blocks`, `library`, and `triggers`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/status.js src/ui/settings.js src/main.js src/styles/crt.css
git commit -m "feat: add status strip with error reporting and MIDI settings panel"
```

---

## Task 9: Register the launcher

**Files:**
- Modify: none in this repo

- [ ] **Step 1: Register a clickable launcher**

Run:

```bash
node "C:/Users/nik/Documents/AI/Busdriver/windows/log-launcher.mjs" \
  --title "CRT Strudel Editor" \
  --cwd "C:/Users/nik/Documents/Creative/Audio/Strudel stack" \
  --command npm --args "run dev" \
  --open http://localhost:5173 --ready 2000 \
  --desc "CRT-styled Strudel live-coding editor with snippet library and loopMIDI out"
```

Expected: writes `CRT Strudel Editor.cmd` into `C:/Users/nik/Documents/AI/Busdriver/dashboard/`.

- [ ] **Step 2: Log the product completion**

Run:

```bash
node "C:/Users/nik/Documents/AI/Busdriver/windows/log-product.mjs" \
  "C:/Users/nik/Documents/Creative/Audio/Strudel stack" \
  --agent "crt-strudel" --kind ui
```

Expected: appends one line to `product-completions.jsonl`.

---

## Self-Review

**Spec coverage:** Boot screen → Task 1. Editor pane and CRT theme → Task 5. Library panel with two tabs, insert, save, promote → Task 6. Strudel engine with replace semantics, error callback, prebake → Tasks 1 and 8. MIDI output and port selection → Tasks 2 and 8. MIDI input → Tasks 2 and 7. Trigger map with all six documented actions → Task 7. Block model → Task 3. Persistence with export/import → Tasks 4 and 6. Error handling (eval errors, no MIDI port, corrupt storage) → Tasks 4, 7, 8. All six spec verification items appear as browser checks in Tasks 1, 2, 5, 6, 7, 8.

**Gaps accepted:** `localStorage` quota warning is not implemented — text snippets will not approach the 5 MB limit, and the export path already exists as a mitigation. Web MIDI permission-denied shows as `MIDI: not connected` (Task 8) rather than a distinct message; the console warning in `enableMidi` names the cause.

**Type consistency:** `EditorPane` method names are used identically in Tasks 5, 6, 7, 8. `Library`/`Entry` shapes and the `kind` values `'snippets'`/`'songs'` match across `library.js`, `storage.js`, and `panel.js`. `status.info`/`status.error`/`status.setMidi` are defined in Task 8 and consumed in Task 7 — Task 8's Step 4 states the required construction order.

**Known sequencing note for the executor:** Task 7 consumes `status` from Task 8. If executing strictly in order, create a two-line stub in Task 7 (`const status = { info: console.log, error: console.error };`) and replace it in Task 8 Step 4.
