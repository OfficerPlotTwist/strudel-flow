import { describe, expect, it } from 'vitest';
import {
  defaultTabHoldTriggers,
  resolveTabHold,
  setTabHoldTrigger,
  tabHoldBindings,
} from '../src/triggers.js';

const tabs = [
  { id: 'tab-1', name: 'drums' },
  { id: 'tab-2', name: 'bass' },
];

describe('defaultTabHoldTriggers', () => {
  it('gives Alt+N to add and Ctrl+Alt+N to solo', () => {
    expect(defaultTabHoldTriggers(0)).toEqual({ add: 'key:Alt+1', solo: 'key:Ctrl+Alt+1' });
    expect(defaultTabHoldTriggers(8)).toEqual({ add: 'key:Alt+9', solo: 'key:Ctrl+Alt+9' });
  });

  it('leaves the tenth tab onward unbound - there are no more digits', () => {
    expect(defaultTabHoldTriggers(9)).toEqual({ add: null, solo: null });
  });
});

describe('tabHoldBindings', () => {
  it('binds by position so a new tab is playable immediately', () => {
    expect(tabHoldBindings(tabs)[1]).toMatchObject({ tabId: 'tab-2', add: 'key:Alt+2' });
  });

  it('lets an override follow its tab rather than its position', () => {
    const bindings = tabHoldBindings(tabs, { 'tab-2': { add: 'key:q' } });
    expect(bindings[1].add).toBe('key:q');
    expect(bindings[1].solo).toBe('key:Ctrl+Alt+2');
  });
});

describe('resolveTabHold', () => {
  const bindings = tabHoldBindings(tabs);

  it('resolves add and solo separately', () => {
    expect(resolveTabHold(bindings, 'key:Alt+2')).toEqual({ tabId: 'tab-2', mode: 'add' });
    expect(resolveTabHold(bindings, 'key:Ctrl+Alt+1')).toEqual({ tabId: 'tab-1', mode: 'solo' });
  });

  it('returns null for an unbound trigger, and for none at all', () => {
    expect(resolveTabHold(bindings, 'key:z')).toBe(null);
    expect(resolveTabHold(bindings, null)).toBe(null);
  });
});

describe('setTabHoldTrigger', () => {
  const bindings = tabHoldBindings(tabs);

  it('rebinds one tab and mode', () => {
    const overrides = setTabHoldTrigger({}, bindings, 'tab-1', 'add', 'key:z');
    const next = tabHoldBindings(tabs, overrides);
    expect(resolveTabHold(next, 'key:z')).toEqual({ tabId: 'tab-1', mode: 'add' });
    expect(resolveTabHold(next, 'key:Alt+1')).toBe(null);
  });

  it('steals a key already used by another tab, in either mode', () => {
    const overrides = setTabHoldTrigger({}, bindings, 'tab-1', 'add', 'key:Ctrl+Alt+2');
    const next = tabHoldBindings(tabs, overrides);
    expect(resolveTabHold(next, 'key:Ctrl+Alt+2')).toEqual({ tabId: 'tab-1', mode: 'add' });
    expect(next[1].solo).toBe(null);
  });

  it('can clear a binding', () => {
    const overrides = setTabHoldTrigger({}, bindings, 'tab-1', 'solo', null);
    expect(tabHoldBindings(tabs, overrides)[0].solo).toBe(null);
  });
});
