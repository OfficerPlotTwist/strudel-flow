import { defineConfig } from 'vite';

// Every @strudel package the app touches, directly or transitively. They have
// to be named explicitly because the two settings below act on package names,
// not on a prefix.
const STRUDEL = [
  '@strudel/core',
  '@strudel/mini',
  '@strudel/tonal',
  '@strudel/transpiler',
  '@strudel/webaudio',
  '@strudel/web',
  '@strudel/codemirror',
  '@strudel/draw',
  '@strudel/midi',
  '@strudel/soundfonts',
];

export default defineConfig({
  server: { port: 5173, open: false },

  // THE fix for "boots fine, reports nothing, makes no sound".
  //
  // @strudel/web's published `main` is dist/index.js, a prebuilt bundle with a
  // full copy of @strudel/core (and of webaudio, and therefore superdough)
  // INLINED. Every other @strudel package imports core as an external. So the
  // app ended up with two of everything: initStrudel's scheduler ran inside
  // web's private core, while `getAudioContext()` - imported from
  // @strudel/webaudio in engine.js - handed back the OTHER superdough's
  // AudioContext. Two live AudioContexts, patterns scheduled against one and
  // the speakers wired to the other. Measured at the destination: peak 0.0,
  // RMS 0.0, and not one error in the console.
  //
  // web.mjs is the same entry unbundled, importing core/webaudio/mini/tonal as
  // externals - so everything shares the single deduped instance.
  resolve: {
    alias: [{ find: /^@strudel\/web$/, replacement: '@strudel/web/web.mjs' }],
    // Belt and braces: guarantee one instance even if a transitive dependency
    // ever resolves its own nested copy.
    dedupe: STRUDEL,
  },

  // @strudel/core is a SINGLETON in every sense that matters: the Pattern
  // class, the control registry, and the `$:` pattern store are module-level
  // state. Two instances means `evaluate()` registers patterns into one store
  // while the scheduler plays from the other - which presents as an app that
  // boots cleanly, reports no error, and is completely silent.
  //
  // Vite's dep pre-bundling created exactly that. Its optimizer only shares
  // common chunks *within a single pass*, and @strudel/soundfonts is loaded
  // through a dynamic import (see engine.js) - so it was discovered late, in a
  // second pass, and got its own inlined copy of core rather than sharing the
  // first pass's. Naming every @strudel package here forces them all into the
  // one pass, where core is hoisted into a shared chunk and there is exactly
  // one instance again.
  //
  // Excluding them instead does NOT work: @strudel/tonal depends on
  // `chord-voicings`, which is CJS, and only the pre-bundler's interop can
  // give it a default export.
  optimizeDeps: { include: STRUDEL },

  // The production build goes through Rollup, which does not pre-bundle - but
  // dedupe is what guarantees a single instance if a transitive dependency
  // ever resolves its own nested copy.
});
