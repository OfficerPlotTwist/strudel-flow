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
