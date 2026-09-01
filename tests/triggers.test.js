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
