# Working on this repo

A CRT-styled Strudel live-coding editor driven by an Akai APC40. Read this
before changing anything: most of what follows was established by measurement
after a wrong guess had already shipped, and the wrong guesses are the kind
that produce plausible, confident, silently incorrect output.

## How to check your work

```
npx vitest run                          # unit tests, all pure modules
npx vite --port 5199 --strictPort       # then, in another shell:
node scripts/smoke.mjs http://localhost:5199
node scripts/verify-snippets.mjs http://localhost:5199   # needs headless:false
node scripts/build-controls.mjs --open  # regenerate the controls sheet
```

**`scripts/smoke.mjs` has two PRE-EXISTING failures.** Do not chase them and do
not count them as regressions:

- *"Ctrl+e opens a second window"* — headless Chromium blocks the popup.
- *"settings offers a MIDI control surface"* — `.settings` matches two elements
  since the MIDI monitor was added; a selector bug in the test.

Anything else failing is yours.

`verify-snippets.mjs` is the strongest check available: it evaluates every
seeded snippet against the real engine **and listens to the master bus** to
confirm it made a sound. A snippet that parses but is silently dead passes
every unit test and fails this.

### The probe harness

The most productive technique in this repo is a throwaway Playwright script
that imports the app's own modules in page context. It gives you the real
engine, the real audio graph, and the real module instances:

```js
const r = await p.evaluate(async () => {
  const args = await import('/src/args.js');            // any app module
  const core = await import(/* @vite-ignore */ '/node_modules/@strudel/core/dist/index.mjs');
  const { mini } = await import(/* @vite-ignore */ '/node_modules/@strudel/mini/dist/index.mjs');
  await import(/* @vite-ignore */ '/node_modules/@strudel/tonal/dist/index.mjs').catch(() => null);
  // Query real pitches - this is how to prove musical output, not by reading code:
  return core.n(mini('0 1# 2')).scale('c4:major').queryArc(0, 1).map((h) => h.value.note);
});
```

**Evaluating without erroring is not evidence of correctness.** Several forms
in this codebase parse happily and mean something else. Query the haps.

### Reading the editor's text from a probe

`innerText` on `.cm-content` also returns the block widgets drawn over the
document — knob-address rows and the armed-cycle badge — so a raw read reports
`all(...)0` and stray blank lines as if they were code. Every readout is
`aria-hidden`; filter on that. `readCode()` in `scripts/smoke.mjs` does it.

## Facts about Strudel that its docs do not state

All measured against the running engine. Do not re-derive these by reading.

| Form | What it actually does |
|---|---|
| `n("0 1# 2").scale("c4:major")` | C4 **Eb4** E4 — `#` raises a scale DEGREE by a semitone, chromatically. Not "the next degree". |
| `_` | Holds the previous note through the step. A leading `_` has nothing to hold. |
| `~` | A real rest. The only way to get silence. |
| `.cps(0.75)` | **Moves the transport.** The Cyclist reads `cps` off every hap. |
| `.cps(saw.range(0.5, 1).slow(4))` | Sweeps the tempo — measured smooth over 16 steps. Note it REPEATS, so it is a wobble, not a blend. |
| `all(x => ...)` | Applies to every pattern in the song. Works, though undocumented. |
| `multiChannelOrbits` | Defaults to **false**, so orbit N does not auto-claim channels (2N-1, 2N). |

### Reverb is per-ORBIT, and this is load-bearing

`room` is a per-event send (`sendReverb(node, amount)`), cheap, per block.
`roomsize`, `roomdim`, `roomfade` and `roomlp` are properties of the orbit's
single reverb node, and changing one regenerates the convolver's impulse
response. superdough's own source annotates the failure:

```js
// avoids endless regeneration on things like
//   stack(s("a"), s("b").rsize(8)).room(.5)
```

Two blocks on one orbit carrying different sizes regenerate **per event** — no
amount of debouncing a knob fixes that, because the thrash comes from the
blocks disagreeing. Hence: one orbit per song, one `roomsize` in one bus
statement (`src/bus.js`), and those four controls are in `RECALCULATING` in
`src/args.js` and never bound to a knob.

The cue bus (`src/monitor.js`) is the deliberate exception: its own orbit, so
its reverb does not bleed into the mains. It also needs no second
`AudioContext` — superdough already routes per orbit to named output channels,
so the split is a suffix on one pattern.

## Invariants you can break without noticing

**Never re-evaluate per MIDI message.** `live.js` serialises evaluations
(`queue = queue.then(runEvaluation, ...)`), and the device pots emit up to 200
messages a second. One knob sweep queued ~200 transpiles and the surface went
deaf under the backlog while MIDI kept arriving. Write the document per
message; tell the parser on the trailing edge (`scheduleArgRefresh` in
`main.js`). Tempo ramps retime `scheduler.cps` directly and write `setcpm`
once, at the end, for the same reason.

**Everything addresses TOP-LEVEL BLOCKS.** Holds unmute one, rips remove one,
arming gates one, the block cursor walks them, and the knobs edit one. Wrapping
a song in `stack(...)` would leave it with a single block and break all five.
That is why the master section is `all(x => ...)` and why it is per-block
rather than per-song.

**The block cursor and the selection are two different things.** The selection
is what play, rip and Ctrl+M act on; the cursor is which ONE of possibly
several the knobs edit. Creating a block must move the cursor to it
(`focusNewBlock`), or the next turn of the cue encoder jumps away and drags the
knobs with it.

**Reserved tracks.** Parts are dealt across track selects 1–7 only. Track 8 is
the reverb pair and `master` is the block's output stage (`adsr`, `lpf`, `hpf`,
`postgain`). Both must mean the same thing whichever block is under the cursor —
a knob whose meaning depends on how many numbers a block happens to contain
cannot be reached for without looking.

**A block's first line is often a comment.** Every part carries a short label.
Any guard that inspects "the first non-blank line" must skip comments too —
`looksLikeCode` in `src/arm.js` did not, which made every block in a labelled
song unarmable and play do nothing at all.

**Key and tempo are song-global.** Two blocks in different keys is not a
modulation, it is a mistake nobody typed on purpose; a second `setcpm` is a
tempo change the arrangement did not ask for. `setSongKey`/`setSongBpm` rewrite
every declaration at once and preserve each block's own octave and mode.

## Ingesting transcriptions

`scripts/ingest-songsterr.mjs` and `scripts/ingest-hooktheory.mjs` exist
because the obvious approach fails silently: both sites render their notes from
JS/WASM, so reading the page HTML returns no notes at all, which is very
tempting to paper over with a plausible invention.

**Songsterr string indices are 0-BASED.** A four-string bass declares
`strings: 4` and its notes carry `string: 0..3`. `tuning[string - 1]` is the
intuitive guess — tab staves are drawn 1..6 — and it reads every note off the
neighbouring string while returning a clean, confident, wrong answer. Get Got
was transcribed in B minor that way; it is in G minor.

**The cross-check that catches it lives outside the script:** the pitches must
agree with the song's published key. If they do not, suspect the string index
first. Do this check every time.

Tab data is gzip JSON on CloudFront, no auth:
`{CDN}/{songId}/{revisionId}/{meta.image}/{trackIndex}.json`, where `image` is
the build hash from `/api/meta/{songId}`. The CDN omits `content-encoding`, so
`fetch` hands back compressed bytes — hence the magic-byte check.

## A tooling hazard specific to editing this repo

Patch scripts that pass `\\n` through a shell heredoc can have the escape
collapse, producing a real newline inside a string literal (a syntax error, so
you notice) or a **control byte** (which you do not). A `\b` word boundary
became a literal 0x08 in a regex here: it parsed, it built, and it silently
never matched.

Prefer line-index edits or `String.fromCharCode(10)` over embedded escapes, and
audit afterwards:

```bash
python -c "
import io,glob
bad={chr(7),chr(8),chr(11),chr(12)}
print([f for f in glob.glob('src/**/*.js',recursive=True)+glob.glob('tests/*.js')+glob.glob('scripts/*.mjs') if bad & set(io.open(f,encoding='utf-8').read())] or 'clean')"
```

## The controls sheet

`src/controls-doc.js` is the single source of truth for every binding;
`npm run controls` renders `docs/controls.html`. `tests/controls-doc.test.js`
checks it against `main.js` in both directions, so a new binding that is not
documented fails the suite. It cannot check that the descriptions are right —
that is the one thing a human has to read.

The surface **re-scopes** controls rather than adding them: REC pins a block
normally and leaves pattern build inside it; clip row 1 solos a song tab
normally and is the scale degree inside it. Any table of bindings needs a
"when" column or it is wrong half the time.

## What a probe sweep found, and what it settled

Three agents probed this codebase independently and confirmed ten bugs, all
now fixed (`cb9b393`). They are recorded here not as history but because the
SHAPE of them repeats, and because several plausible theories were disproven at
some cost — re-deriving those would be waste.

### The failure mode that produced most of them

**A guard written for the one dangerous case you thought of, while the class
has three members.** Pattern build edits the cursor block in place. The reverb
bus was foreseen and guarded; a hand-written melody and an over-long pattern
were not, and both were destroyed on the first pad press with no error. When
you protect one instance of "input this code cannot faithfully round-trip",
ask what else is in that set.

**The other recurring shape: a rewrite that matched text instead of code.** The
key and tempo knobs rewrote every `.scale()` and `setcpm()` in the file,
including inside comments and string literals, so turning a knob mid-set edited
documentation. Any song-global rewrite must go through `replaceInCode`.

### Settled questions — do not re-investigate

- **Knob writes are NOT stale between MIDI messages.** It looks like they must
  be: `scheduleArgRefresh` debounces the parser by 120 ms while a pot emits
  ~200 msg/s, which suggests `argKnobs.slots` goes stale and a virtual slot
  gets appended repeatedly. It does not. CodeMirror's `updateListener` fires
  synchronously on every `docChanged` regardless of the `notify:false` flag,
  and `main.js` wires it straight to `refreshArgMap()`; messages are handled one
  at a time on the main thread. A five-step sweep on a virtual `adsr` slot
  produces exactly one `.adsr(...)` call. Verified, twice, from opposite
  directions.
- **`formatArgValue` cannot emit `-0` in practice.** The pure function can for
  adversarial inputs, but sweeping all 128 knob positions against every
  negative-capable range (`nudge`, `detune`) never lands in the band that
  rounds to `-0`. Not reachable.
- **The tempo-ramp race is correctly designed.** Starting a second ramp before
  the first lands picks up from the live in-flight value, not the stale written
  one, and the document is still written exactly once.
- **A tab closing now announces itself, and the pattern write checks.** It
  looked as though the crossfader-timed delete could leave pattern build
  pointing at a dead tab; probed, closing the VIEWED tab already routes through
  `viewTab` and fires `onViewTab`, which exits the mode. What did not fire was
  a close of any OTHER tab, and `replaceBlockText` returns quietly on a missing
  tab - so the failure would have been a lit grid recording nothing. Fixed at
  the class rather than the route: `onCloseTab` fires for every close, and
  `writePattern` refuses on `!pane.hasTab(tabId)` and drops the mode.
- Also verified sound: annotation alignment against nested calls, negative
  numbers and four arguments on one line; argument overflow past 56 slots;
  the burst guard in `arg-knobs.js`; `maskCode` on escaped quotes, template
  literals and unterminated strings; circle-of-fifths wrap in both directions;
  `webmidi@3.1.16` taking raw 0–127 for `sendControlChange`.

### Known rough edges, not yet addressed

- **`SHIFT + TC 4` re-keys the DECLARATION only, by decision.** It rewrites
  every `.scale("d3:minor")` and the degrees follow; a block using absolute
  `note("c4 e4")` stays where it is. That is accepted behaviour, not a bug to
  fix - the knob owns the key declaration and nothing else. Do not "improve" it
  into a transposer.
- **Five files are CRLF** where the rest of the repo is LF: `src/explain.js`,
  `src/library.js`, `src/midi-probe.js`, `src/seed-fx/mix.js`,
  `src/ui/popout.js`. Harmless today; worth a single normalising pass rather
  than churning them mid-change.
- The `.gitattributes` says `* text=auto eol=lf`, so those five predate it.

### How the sweep was run, if you want to repeat it

Three agents, one area each, **one dev-server port each** — they must not share
a server, because the Strudel engine is global and `evaluateCode` replaces
whatever is playing. Each was told to confirm with a runnable probe or report
nothing, and not to fix anything.

That fan-out worked because the areas could be wrong INDEPENDENTLY. Probing an
existing artefact parallelises; deriving a design does not, because each finding
changes the next decision and you get three incompatible answers.

**Verify every finding yourself before acting on it.** Of the eleven reported,
all held up — but the check is cheap and one of them ("stop a lone const kills
the song") was severe enough that acting on a wrong report would have been
worse than not looking.
