# Local sample import - implementation report

## Branch
`feat/local-samples`

## Sample-map contract (confirmed from `node_modules/superdough/sampler.mjs`)

- `samples(sampleMap, baseUrl)` (or `samples(url)` which fetches JSON and recurses)
  accepts a plain object: `{ soundName: [relativePath, ...], _base: "..." }`.
- `_base` is a top-level key; `processSampleMap()` reads `sampleMap._base` as the
  default `baseUrl`, then does `baseUrl + relativePath` for every entry (see
  `sampler.mjs:146-173`). A `_base` value like `/samples/` works with plain root-
  relative paths (no `github:`/`bubo:` special-casing needed).
- An array of N paths under one key indexes by `n` (`s("name:n")`):
  `getCommonSampleInfo()` in `node_modules/superdough/util.mjs:87-111` does
  `index = getSoundIndex(n, bank.length); url = bank[index]` when `bank` is an
  array - confirming `s("bow")` = index 0, `s("bow:1")` = index 1, etc.
- An object value (keyed by note name) is the alternate "instrument" shape;
  not used here since these are one-shots, not pitched multisamples.

## Vite `public/` serving (confirmed)

- No `publicDir` override in `vite.config.js` -> Vite's default `public/` applies.
- Files under `public/` are served at the site root in `vite` dev (verified:
  `GET /samples/local.json` -> 200, `application/json`) and are copied verbatim
  into `dist/` on `vite build` (verified: `dist/samples/local.json`,
  `dist/samples/bow/...wav`, `dist/samples/bowtwang/...wav` all present after build).

## Piece 1 - `scripts/import-sample.mjs`

Node-builtins-only (`fs`, `path`, `url`). Copies `.wav` file(s)/folder(s) into
`public/samples/<name>/`, merges relative paths into `public/samples/local.json`
(creating it with `_base: "/samples/"` if absent), dedupes via `Set` before
sorting so re-running is idempotent, validates `--name` against
`^[a-zA-Z0-9]+$`, and errors clearly on missing paths / non-`.wav` files.

## Piece 2 - `src/engine.js` boot-time loader

Added `loadLocalSamples()` and a `['local samples', () => loadLocalSamples()]`
entry in the existing `prebake` bank list (same independent try/catch wrapping
as every other bank).

**Important finding during verification:** a naive `fetch('/samples/local.json')`
+ `res.ok` check is NOT sufficient. Vite's dev-server SPA fallback returns
`200 text/html` (index.html) for an unmatched path whenever the request's
`Accept` header lacks `text/html` - which is exactly what `fetch()` sends by
default (`Accept: */*`). Confirmed via curl:
- `curl -H "Accept: */*" http://localhost:5175/samples/local.json` (file absent)
  -> `200`, body is `index.html`.
- `curl -H "Accept: application/json" ...` (same absent file) -> real `404`.

So `loadLocalSamples()` also checks `res.headers.get('content-type')` includes
`json`, and wraps `res.json()` in its own try/catch - both failure paths log
only `console.debug` and return, never throwing out to prebake's
`console.warn` fallback. This keeps a missing `local.json` completely silent
(no warning) in both dev and production builds.

## Imported samples

- `bow` <- `C:\Users\nik\Documents\Creative\bow-sounds\4Nu3fOo_QPc.wav`
  (raw 7s recording) -> `public/samples/bow/4Nu3fOo_QPc.wav`
- `bowtwang` <- `C:\Users\nik\Documents\Creative\bow-sounds\bow_twang_4Nu3fOo_QPc.wav`
  (0.519s trimmed transient) -> `public/samples/bowtwang/bow_twang_4Nu3fOo_QPc.wav`

Kept as two separate sound names (not two indices under one name) per the
task's instruction - a 7s raw clip and a 0.5s transient are different musical
objects.

Resulting `public/samples/local.json`:
```json
{
  "_base": "/samples/",
  "bow": [
    "bow/4Nu3fOo_QPc.wav"
  ],
  "bowtwang": [
    "bowtwang/bow_twang_4Nu3fOo_QPc.wav"
  ]
}
```

## Verification results

1. `npm test` -> **34 passed** (3 files: blocks, library, triggers).
2. `npx vite build` -> succeeded. `dist/samples/local.json`,
   `dist/samples/bow/4Nu3fOo_QPc.wav`, `dist/samples/bowtwang/bow_twang_4Nu3fOo_QPc.wav`
   all present.
3. `npm run dev` (vite picked port 5175; 5173/5174 already in use by other
   processes on this machine):
   - `GET /` -> `200`
   - `GET /samples/local.json` -> `200` (`content-type: application/json`)
   - `GET /samples/bow/4Nu3fOo_QPc.wav` -> `200`
   - Server stopped via `Stop-Process -Id <listening PID from netstat>`, a
     targeted kill of only that PID (never `taskkill /F /IM node.exe`).
4. Re-ran `node scripts/import-sample.mjs .../4Nu3fOo_QPc.wav --name bow` a
   second time: `local.json`'s `"bow"` array is still exactly
   `["bow/4Nu3fOo_QPc.wav"]` - no duplicate entry. (Shown above.)
5. `evaluateCode` call sites: **exactly 3** - `src/main.js:39` (boot),
   `src/main.js:77` (block-toggle), `src/actions.js:20` (`setActiveScript`).
   Plus the definition (`src/engine.js:130`), an import line, and one comment
   reference - none of those are calls.
6. Missing-`local.json` boot behavior: temporarily renamed
   `public/samples/local.json` -> `local.json.bak`, restarted `vite`, and
   confirmed via curl that `fetch('/samples/local.json')` (default
   `Accept: */*`, matching real browser `fetch()` behavior) returns Vite's
   `200 text/html` SPA-fallback body, NOT a 404. `loadLocalSamples()`'s
   content-type check correctly treats this as "nothing to load" and returns
   silently (`console.debug` only) rather than throwing into prebake's
   `console.warn` path. Restored the file afterward and re-verified
   `content-type: application/json` is served normally when present.

## Concerns / notes

- The dev-server SPA-fallback behavior above is Vite-specific and easy to miss
  if you only test with `res.ok`; it's the reason the implementation checks
  content-type rather than status alone. Worth keeping in mind for any future
  code that fetches optional static JSON in this project.
- `npx vite build` prints an unrelated pre-existing warning about `eval` usage
  inside `@strudel/soundfonts` - not something this change touched.
- Two `.wav` files (`public/samples/bow/4Nu3fOo_QPc.wav`,
  `public/samples/bowtwang/bow_twang_4Nu3fOo_QPc.wav`) are committed as binary
  project assets, per the task's instruction.

## Fix round 1

Three review follow-ups addressed in `scripts/import-sample.mjs` and `src/engine.js`.

**Finding 1 (must-fix, silent data loss)** - Two source files sharing a
basename, imported under the same `--name`, would silently overwrite each
other on disk with no error. Fixed with a pre-copy conflict check: before
copying or touching `local.json`, every destination is checked with
`fs.existsSync` + a new `filesEqual()` helper (size check, then
`Buffer.equals()` on the full contents). Identical contents -> skip the copy
silently (normal idempotent re-run). Different contents -> `fail()` with a
message naming both paths and suggesting a different `--name` or renaming the
source, and `process.exit(1)` before any copy or JSON write happens for that
run.

**Finding 2 (must-fix, one word)** - `loadLocalSamples()`'s malformed-JSON
catch block was logging at `console.debug`, identical to the two legitimately-
expected "nothing to load" paths (missing file, dev-server SPA-fallback
non-JSON response). Raised that one branch to `console.warn`, naming
`/samples/local.json` explicitly, so a genuinely broken file (bad hand-edit,
bad merge, disk issue) is distinguishable from an empty fresh clone. The two
expected-absence paths remain at `console.debug`.

**Finding 3 (fix if cheap - index shifting)** - Since `local.json` entries are
sorted lexicographically, a newly-imported file that sorts before existing
entries for the same `--name` shifts every later index, silently changing
what `s("name:n")` resolves to for any saved pattern. Added a post-merge diff:
build an `oldIndex` map from the pre-merge array, compare every entry's index
after the sort, and if anything moved, print a `console.warn`-style block
naming the sound, each shifted file's old -> new `s("name:n")` mapping, and a
note that saved patterns may now resolve differently. Script-side warning
only, no auto-renumbering.

**Own bug caught during verification:** the round-0 SPA-fallback doc comment
in `src/engine.js` contained the literal text `Accept: */*` inside a `/* */`
block comment - the embedded `*/` terminates the comment early, which is
valid-looking but breaks parsing. `npm test` never caught it (no test file
imports `engine.js`, so esbuild/vitest never transforms it), but
`npx vite build` correctly failed with an import-analysis syntax error the
first time it was re-run in this round. Fixed by rewording the comment to say
"star-slash-star" instead of the literal token. Lesson: after any edit to a
file untouched by the test suite, a build pass, not just `npm test`, is
required before claiming done - noted here since it's exactly the kind of gap
`verification-before-completion` exists to catch.

### Verification (fix round 1)

1. **Finding 1 demo**: created two 10-byte / 16-byte files both named `hit.wav`
   in separate scratch folders with different contents (`AAAAAAAAAA` vs.
   `BBBBBBBBBBBBBBBB`). Imported the first under `--name testconflict` (exit 0).
   Imported the second under the same name - got:
   ```
   [import-sample] refusing to overwrite "public\samples\testconflict\hit.wav" -
   it already exists with different contents than source "...dirB\hit.wav".
   Pass a different --name, or rename the source file so it doesn't collide.
   ```
   exit code 1. Confirmed afterward: `public/samples/testconflict/hit.wav`
   still contained `AAAAAAAAAA` (unchanged), and `local.json`'s `testconflict`
   entry was still exactly `["testconflict/hit.wav"]` (no duplicate, no
   corruption from the failed attempt).
2. **Idempotent re-run**: re-ran the import with the *first* file (dirA/hit.wav)
   under the same name again - exit 0, no warning, `local.json` unchanged
   (still a single `testconflict/hit.wav` entry, no duplicate).
3. **Finding 3 demo**: imported a third file `aaa.wav` (sorts before `hit.wav`)
   under the same `testconflict` name. Output:
   ```
   [import-sample] WARNING: import shifted existing indices for "testconflict":
     testconflict/hit.wav: s("testconflict:0") -> s("testconflict:1")
     Saved patterns referencing s("testconflict:<n>") may now play a different
     sample. No files were changed to compensate - update any saved patterns
     manually.
   ```
4. `npm test` -> **34 passed** (3 files). `npx vite build` -> succeeded (after
   fixing the comment bug above); `dist/` output confirmed clean.
5. `evaluateCode` call sites re-checked: still exactly **3**
   (`src/actions.js:20`, `src/main.js:39`, `src/main.js:77`), plus the
   definition at `src/engine.js:149`.
6. Cleanup: removed `public/samples/testconflict/` and the scratch temp
   folders/files, and rewrote `public/samples/local.json` back to only `bow`
   and `bowtwang`:
   ```json
   {
     "_base": "/samples/",
     "bow": [
       "bow/4Nu3fOo_QPc.wav"
     ],
     "bowtwang": [
       "bowtwang/bow_twang_4Nu3fOo_QPc.wav"
     ]
   }
   ```
   `git status --short` confirms only `scripts/import-sample.mjs` and
   `src/engine.js` are modified - no stray files left in `public/samples/`.
