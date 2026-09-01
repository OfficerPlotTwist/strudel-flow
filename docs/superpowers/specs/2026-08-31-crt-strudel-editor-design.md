# CRT Strudel Editor — Design

**Date:** 2026-08-31
**Status:** Approved design, pending implementation plan

## Purpose

A custom live-coding cockpit for Strudel: a CRT-styled browser editor with a
snippet/song library on the right, multiple song-script pages on the left, and
hotkey plus MIDI-in control over which script is live and which blocks are
muted. Pattern MIDI streams out to loopMIDI with minimal added latency, feeding
audioreactive visual software (the visual side is out of scope here).

## Scope

**In scope:** editor shell, library data model, tabbed song pages, block
comment/restore, active-script switching, hotkey and MIDI-in trigger map, MIDI
output port selection, local persistence.

**Out of scope:** the audioreactive visuals themselves, any custom MIDI clock or
transport-event layer, multi-machine sync, cloud storage, collaborative editing.

## Runtime target

A static browser app, no backend. Served locally in development by Vite (Node
based, cross-platform, so the project ports to Linux unchanged). Runs in a
Chromium browser, which is required for the Web MIDI API.

The app reuses Strudel's own published packages rather than reimplementing
pattern parsing, audio scheduling, or MIDI emission. Versions verified on npm
2026-08-31; pin exactly, because the packages carry version skew:

- `@strudel/web` **1.3.0** — pattern engine, audio scheduler, code evaluation
- `@strudel/codemirror` **1.3.0** — Strudel highlighting extensions for CodeMirror 6
- `@strudel/midi` **1.3.0** — pattern MIDI output via Web MIDI
- `@strudel/core` is pinned by `@strudel/web` at **1.2.6** — do not force-align it

`@strudel/web` does **not** bundle `@strudel/midi`. It must be installed
separately, imported for its `Pattern.prototype.midi` side effect, and added to
the `evalScope` so user code can call `.midi()`.

**Canonical repo is `codeberg.org/uzu/strudel`.** The `tidalcycles/strudel`
GitHub repo is a stale mirror (last pushed 2025-06-19). All packages are
**AGPL-3.0-or-later** — publishing this app publicly would oblige offering
source. Fine for a personal instrument; noted so it is not a surprise later.

We build only the CRT shell, the library and song data model, and the trigger
layer around them.

## Components

### 0. Boot screen (audio unlock) — required, not decorative

`initStrudel()` unlocks audio through `initAudioOnFirstClick()`, which binds
**`mousedown` on `document` and nothing else** — not `keydown`, not
`pointerdown`. A keyboard- and MIDI-driven cockpit where the user never clicks
would never unlock the AudioContext, and the resulting failure is *silence with
no error*, because `loadWorklets()` swallows failure into a `console.warn`.

The app therefore opens on a CRT power-on screen that requires one click to
enter the session. This makes the gesture an explicit, always-satisfied
precondition rather than an invisible trap, and it suits the aesthetic.

Ordering is load-bearing:

1. Call `initStrudel()` **at page load, before the gesture** — it registers the
   `mousedown` listener, so calling it *inside* a click handler means the first
   click is already spent and audio unlocks only on a second click.
2. Import `@strudel/webaudio` **statically**, not lazily — it calls
   `registerWorklet()` as a module-level side effect, and a lazy import after
   the first mousedown misses the worklet load.
3. The boot click resumes the context; worklets load *after* it, not at init.

On boot, also guard explicitly: if `getAudioContext().state === 'suspended'`,
`await ctx.resume()`.

### 1. Song Editor Pane (left)

Multiple tabs, each holding one full Strudel song script. Each tab is a
**self-managed CodeMirror 6 instance** — deliberately *not* `StrudelMirror`.

`StrudelMirror` owns its own repl per editor, which conflicts with our
single-shared-engine model, and it carries two host-page side effects we do not
want: it persists to a `codemirror-settings` localStorage key (colliding with
our own persistence) and `activateTheme` mutates `document.documentElement`'s
class list.

Instead we compose the standalone pieces `@strudel/codemirror` exports, which
have no editor coupling:

- `highlightExtension` in our extension list
- `updateMiniLocations(view, meta.miniLocations)` after each evaluation
- `highlightMiniLocations(view, time, haps)` per animation frame

This gives us Strudel's active-pattern highlighting while our CRT theme —
phosphor palette, monospace face, scanline and vignette overlay in CSS — stays
fully ours as an ordinary CM6 theme extension.

Exactly one tab at a time is the **active** tab — the one bound to the audio
engine. It is visually distinct (glow or border treatment). Switching the
viewed tab does not change which tab is active; making the viewed tab active is
an explicit triggered action.

### 2. Library Panel (right)

Two tabs over a single underlying entry model (`name`, `code`, `kind`):

- **Snippets** — reusable blocks. Clicking one inserts its text at the cursor of
  the active editor tab, as plain text (a copy, not a live reference).
- **Songs** — full song scripts saved from the left pane. Saving pushes the
  current editor tab's text into a named Songs entry; re-saving the same name
  overwrites it after a non-destructive backup of the prior value.

A song, or a selected block within one, can additionally be promoted into
Snippets.

### 3. Strudel Engine

One shared engine instance from `@strudel/web`. Setting a tab active calls
`evaluate(code)`, which has **replace semantics** (`shouldHush` defaults true,
clearing named `$:` patterns first) — exactly the behavior we want. Evaluation
is explicit: driven by set-active or by live re-evaluation after a block toggle
on the active tab, never on every keystroke.

Two engine behaviors the plan must account for:

- **`evaluate()` swallows errors.** On failure it logs, calls `onEvalError`, and
  returns `undefined` — it does not throw. Our error strip must be wired through
  the `onEvalError` / `onUpdateState` callbacks, not a try/catch.
- **`evalScope` writes ~1000 names onto `globalThis`**, including generic ones
  (`all`, `each`, `run`, `rev`, `id`, `pick`, `slider`, `speed`). All app code
  stays in ES modules with no reliance on bare globals, and we never name a
  global of our own that could collide.

**Sample banks.** `initStrudel()` loads *no* samples by default: `note(...)`
works offline, but `s("bd sd")` is silent with only a log line. Since scripts
will routinely be pasted from strudel.cc, we supply a `prebake` modelled on
`@strudel/repl`'s so those patterns sound the same here. `registerSoundfonts()`
is commented out upstream, so `gm_*` sounds require registering it ourselves
(via dynamic import — a static one throws under SSR).

### 4. MIDI output

Strudel's own `.midi()` pattern output, routed to the loopMIDI port. Port
selection is `.midi('portName')` or the patternable `midiport` control; the
per-hap control **overrides** the `.midi()` argument. Name matching is
**substring and case-sensitive**.

Failure behavior is quiet and must be surfaced by our UI: an unmatched port
logs `[midi] midiport "..." not found!` and drops the event — the pattern keeps
running silently. Our settings panel therefore drives selection from live
`WebMidi.outputs` enumeration rather than a typed string.

`.midi()` triggers `WebMidi.enable(..., { sysex: true })` — always sysex, not
overridable through Strudel's API, and it needs a secure context (`localhost`
qualifies). We call the exported `enableWebMidi()` ourselves at boot so the
permission prompt happens on the boot screen, not mid-performance.

**Latency.** Audio and MIDI are aligned *by construction*: MIDI is scheduled at
the same absolute `targetTime` as audio, through an AudioContext-clocked timer.
The scheduler's fixed `latency = 0.1` (100 ms) is a uniform lookahead on both
streams, not a skew between them, so the audioreactive requirement is met. It
is **not configurable** — `repl()` silently drops a `latency` option — and the
`latencyMs` MIDI option in the README **does not exist in the 1.3.0 code**. We
accept the stock value; if action→sound feel proves sluggish in performance,
lowering it means patching the scheduler, traded against dropout risk.

### 5. MIDI input

Web MIDI input enumeration plus a fixed note/CC to action map, editable in the
settings panel. No MIDI-learn mode in this stretch.

### 6. Trigger map (hotkeys + MIDI in)

A single unified map from trigger (keyboard key **or** MIDI note/CC) to action,
so both input paths hit the same action dispatcher. Actions in this stretch:

| Action | Behavior |
|---|---|
| `toggleBlock` | Comment out or restore the block at the cursor |
| `setActiveScript` | Make the currently viewed tab the live one |
| `nextTab` / `prevTab` | Change the viewed tab |
| `hush` | Stop all audio and MIDI output |
| `insertSelectedSnippet` | Insert the library's selected snippet at the cursor |

The map is data, not code, so adding actions later is an entry plus a handler.

### 7. Block model

A **block** is the run of contiguous non-blank lines containing the cursor —
blank-line-delimited, matching how Strudel scripts are already visually grouped.
No marker syntax required. `toggleBlock` prefixes or strips `//` on every line
of that range, preserving indentation.

**Live-mute behavior:** if the toggled block is in the *active* tab, the engine
re-evaluates immediately after the toggle, so the hotkey behaves like a live
mute. On a non-active tab it is a silent text edit.

### 8. Persistence

`localStorage` holds the Snippets library, the Songs library, and settings
(selected MIDI ports, trigger map). An Export/Import JSON control provides
backup and portability without building a file-write pipeline.

## Data flow

```
Library (localStorage)
   │ click / insertSelectedSnippet
   ▼
Active editor tab text ──── setActiveScript ────▶ Strudel engine ──▶ Web Audio
   │                                                    │
   │ toggleBlock (if tab is active → re-evaluate)       └──▶ Web MIDI ──▶ loopMIDI
   │
   └──── save ────▶ Songs tab (localStorage)
```

## Error handling

- **Evaluation errors:** surfaced in a CRT-styled readout strip. Editor content
  is untouched and already-playing audio keeps running; the failed evaluation
  simply does not take effect.
- **No MIDI port:** audio still plays. A status indicator reads
  "MIDI: not connected". Nothing blocks.
- **Web MIDI permission denied:** same degraded path, with an explicit message
  naming the permission as the cause.
- **localStorage full:** a warning prompting an export, rather than a silent
  failed save.

## Verification

No formal automated test suite — this is a single-user live-coding instrument
and the acceptance criteria are behavioral. Verification is running the Vite dev
server and confirming, in a Chromium browser:

1. The engine initializes and a snippet-built script produces audio.
2. `toggleBlock` on the active tab mutes and restores that block live.
3. `setActiveScript` switches which tab drives the engine.
4. The chosen MIDI output port appears in Web MIDI enumeration and receives
   note data while a `.midi()` pattern plays.
5. Library entries survive a page reload.
6. A MIDI-in note bound to `toggleBlock` fires the same action as the key.

Item 4's downstream half — the visual software reacting — is confirmed by the
user, as that software is out of scope.

## Resolved technical questions (research 2026-08-31)

All four original unknowns are closed; findings are folded into the sections
above. Summary of what changed the design:

| Question | Finding | Design impact |
|---|---|---|
| Audio unlock | `mousedown` on `document` only | Boot screen added (component 0) |
| Worklet bundling | Worklets ship inlined as `data:` URIs | **No Vite config needed**; CSP must allow `data:` and `unsafe-eval` |
| Default samples | None loaded; `s("bd sd")` silently fails | `prebake` modelled on `@strudel/repl` |
| MIDI port API | `.midi('name')` substring, or `midiport` control | Panel drives selection from live enumeration |
| CodeMirror | `highlightExtension` is standalone-usable | Self-managed CM6, not `StrudelMirror` |
| MIDI latency option | `latencyMs` absent from shipped code | Accept stock 100 ms; audio/MIDI already aligned |

**Still unverified, to confirm during implementation:**

- Whether `sync: true`'s `clockworker` asset resolves under a consuming Vite
  build (the source carries `@vite-ignore`). Mitigation: leave `sync` off — we
  have no multi-instance sync requirement.
- Exact Chrome permission-prompt behavior for `{ sysex: true }`.
- Live ESM-CDN loading of `@strudel/web@1.3.0` (we use npm + Vite, so this only
  matters if we ever want a buildless fallback).

## Milestone gate

Because the characteristic failure here is **silence with no error**, the plan
must treat *"a pattern makes audible sound, and emits MIDI, in our own page"* as
a standalone verified milestone completed **before** any UI, library, or tab
work depends on it. Building the shell first would make every component a
suspect when the engine turns out to be mute.

## Design rationale

- **Reuse Strudel's packages, don't wrap or fork them.** The blast radius of a
  custom UI around published packages is our own shell; reimplementing the
  scheduler would put pattern-timing correctness on us.
- **One MIDI emitter, not two.** Routing Strudel's own pattern MIDI avoids a
  second clock that could drift against the audio.
- **Copy snippets, don't link them.** Live references would introduce
  versioning and update-propagation complexity for a tool whose main job is fast
  improvisation.
- **Explicit evaluation.** Evaluate-on-keystroke is hostile in live performance;
  the one exception, re-evaluating after a block toggle on the active tab, is
  precisely what makes the mute hotkey useful.
