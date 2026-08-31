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
pattern parsing, audio scheduling, or MIDI emission:

- `@strudel/web` — pattern engine, audio scheduler, code evaluation
- `@strudel/codemirror` — Strudel syntax highlighting for CodeMirror 6
- `@strudel/midi` — pattern MIDI output via Web MIDI

We build only the CRT shell, the library and song data model, and the trigger
layer around them.

## Components

### 1. Song Editor Pane (left)

Multiple tabs, each holding one full Strudel song script. Each tab is a
CodeMirror 6 instance with Strudel syntax highlighting, wrapped in a CRT visual
theme: phosphor palette, monospace face, scanline and vignette overlay in CSS.

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

One shared engine instance from `@strudel/web`. Setting a tab active evaluates
that tab's code and replaces whatever was previously playing. Evaluation is
explicit — driven by the set-active action or by a live re-evaluation after a
block toggle on the active tab — never on every keystroke.

### 4. MIDI output

Strudel's own `.midi()` pattern output, routed to a Web MIDI output port chosen
in a settings panel; in practice the user selects the loopMIDI virtual port.
This deliberately uses Strudel's existing scheduler-driven MIDI path rather than
a second event layer, which keeps latency to Strudel's own scheduling lookahead
and avoids any sync drift between two emitters.

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

## Open technical questions

Resolved during implementation planning, not blocking this design:

- The exact `@strudel/midi` API for selecting an output port, and any
  latency/lookahead options it exposes.
- Whether `@strudel/codemirror` highlighting can be applied to a self-managed
  CodeMirror 6 instance, or whether it wants to own the editor.
- Vite bundling specifics for Strudel's audio worklets and sample loading.

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
