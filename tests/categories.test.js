import { describe, expect, it } from 'vitest';
import docs from '../src/strudel-docs.json';
import { CATEGORY_ORDER, allFunctionNames, describe as describeFn, groupByCategory } from '../src/explain.js';

const canonical = Object.entries(docs).filter(([, v]) => !v.aliasOf);

describe('baked-in categories', () => {
  it('gives every documented name a category', () => {
    const missing = Object.entries(docs).filter(([, v]) => !v.category);
    expect(missing.map(([n]) => n)).toEqual([]);
  });

  it('only ever uses categories the UI knows how to order', () => {
    const unknown = [...new Set(Object.values(docs).map((v) => v.category))].filter(
      (c) => !CATEGORY_ORDER.includes(c),
    );
    expect(unknown).toEqual([]);
  });

  it('leaves almost nothing in the fallback bucket', () => {
    const other = canonical.filter(([, v]) => v.category === 'other');
    // The rules covered 427/429 when written. Allow a little drift on a
    // @strudel upgrade, but fail loudly if a version bump guts the coverage.
    expect(other.length / canonical.length).toBeLessThan(0.05);
  });

  it('files an alias under its canonical name category, not its own spelling', () => {
    const aliases = Object.entries(docs).filter(([, v]) => v.aliasOf);
    expect(aliases.length).toBeGreaterThan(0);
    for (const [, v] of aliases) {
      expect(v.category).toBe(docs[v.aliasOf].category);
    }
  });

  it('puts the obvious cases where a musician would look for them', () => {
    const cat = (n) => docs[n]?.category;
    expect(cat('lpf')).toBe('filter');
    expect(cat('attack')).toBe('envelope');
    expect(cat('room')).toBe('fx');
    expect(cat('setcpm')).toBe('transport');
    expect(cat('note')).toBe('harmony');
    expect(cat('s')).toBe('sample');
    expect(cat('midi')).toBe('midi');
    expect(cat('pianoroll')).toBe('visual');
  });
});

describe('groupByCategory', () => {
  it('returns groups in CATEGORY_ORDER and drops empty ones', () => {
    const groups = groupByCategory(allFunctionNames().map((n) => describeFn(n)));
    const order = groups.map(([c]) => c);
    expect(order).toEqual(CATEGORY_ORDER.filter((c) => order.includes(c)));
    expect(groups.every(([, list]) => list.length > 0)).toBe(true);
  });

  it('accounts for every entry exactly once', () => {
    const all = allFunctionNames().map((n) => describeFn(n));
    const grouped = groupByCategory(all).flatMap(([, list]) => list);
    expect(grouped).toHaveLength(all.length);
  });

  it('keeps an unknown category rather than silently dropping it', () => {
    const groups = groupByCategory([{ name: 'x', category: 'invented' }]);
    expect(groups).toEqual([['invented', [{ name: 'x', category: 'invented' }]]]);
  });
});
