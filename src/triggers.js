export function keyEventToTrigger(event) {
  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  parts.push(key);
  return `key:${parts.join('+')}`;
}

/**
 * Only rising edges produce triggers: note-on with velocity > 0, and CC with
 * value > 0. Note-off and zero-velocity note-on are ignored so a pad press
 * fires exactly once.
 */
export function midiDataToTrigger(data) {
  const [status, d1, d2] = data;
  const type = status & 0xf0;
  if (type === 0x90 && d2 > 0) return `note:${d1}`;
  if (type === 0xb0 && d2 > 0) return `cc:${d1}`;
  return null;
}

export function defaultTriggerMap() {
  return {
    'key:Ctrl+m': 'toggleBlock',
    'key:Ctrl+Enter': 'setActiveScript',
    'key:Ctrl+.': 'hush',
    'key:Ctrl+PageDown': 'nextTab',
    'key:Ctrl+PageUp': 'prevTab',
    'key:Ctrl+i': 'insertSelectedSnippet',
    'note:36': 'toggleBlock',
    'note:37': 'setActiveScript',
    'note:38': 'hush',
    'note:39': 'nextTab',
  };
}

export function resolveAction(map, trigger) {
  return map[trigger] ?? null;
}
