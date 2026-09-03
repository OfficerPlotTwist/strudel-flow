import { describe, expect, it } from 'vitest';
import { isStandaloneBlock } from '../src/blocks.js';
import { SEED_SNIPPETS } from '../src/seed-snippets.js';

describe('isStandaloneBlock', () => {
  it('treats a leading-dot method chain as a fragment', () => {
    // These are what the FUNCS tab and the .midi() button insert; they only
    // make sense chained onto whatever is under the caret.
    expect(isStandaloneBlock('.gain(0.5)')).toBe(false);
    expect(isStandaloneBlock('  .fast(2)')).toBe(false);
  });

  it('treats anything multi-line as a block', () => {
    expect(isStandaloneBlock('$: s("bd")\n  .fast(2)')).toBe(true);
  });

  it('treats a statement opener as a block even on one line', () => {
    expect(isStandaloneBlock('$: s("bd sd")')).toBe(true);
    expect(isStandaloneBlock('setcpm(84/4)')).toBe(true);
    expect(isStandaloneBlock('d1: note("c e g")')).toBe(true);
    expect(isStandaloneBlock('hush()')).toBe(true);
    expect(isStandaloneBlock('samples("github:x/y")')).toBe(true);
  });

  it('treats a bare call as a fragment', () => {
    // s("bd") pasted at the caret is how you build a chain by hand; forcing it
    // onto its own line would break that.
    expect(isStandaloneBlock('s("bd")')).toBe(false);
    expect(isStandaloneBlock('note("c e g")')).toBe(false);
  });

  it('is false for empty or whitespace-only input', () => {
    expect(isStandaloneBlock('')).toBe(false);
    expect(isStandaloneBlock('   \n  ')).toBe(false);
  });

  it('classifies every shipped seed snippet as a block', () => {
    // This is the regression: each of these carries its own `$:`/`setcpm`, so
    // splicing one at the caret welds two statements together and the parser
    // reports an unexpected token.
    for (const snippet of SEED_SNIPPETS) {
      expect(isStandaloneBlock(snippet.code), snippet.name).toBe(true);
    }
  });
});
