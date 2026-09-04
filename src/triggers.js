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

/**
 * Both edges of a MIDI message, for the momentary hold controls.
 *
 * `midiDataToTrigger` above deliberately reports only rising edges, so a pad
 * press fires an action exactly once - which is right for actions and wrong
 * for holds: a hold that never sees its note-off latches on forever. Note-off
 * and zero-velocity note-on are both releases, per the MIDI spec's two ways of
 * saying the same thing.
 */
export function midiDataToHold(data) {
  const [status, d1, d2] = data;
  const type = status & 0xf0;
  if (type === 0x90) return { trigger: `note:${d1}`, isDown: d2 > 0 };
  if (type === 0x80) return { trigger: `note:${d1}`, isDown: false };
  if (type === 0xb0) return { trigger: `cc:${d1}`, isDown: d2 > 0 };
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
    'key:Ctrl+e': 'toggleExplainer',
    // The four rip keys. F1-F5 are the hold-to-unmute row, so these start at
    // F6; all four are one-shot (a rip runs to completion on its own), which
    // is why they live here rather than in the hold slots.
    'key:F6': 'ripToReturn',
    'key:F7': 'ripToNewTab',
    'key:F8': 'ripToLibrary',
    'key:F9': 'ripToActive',
    'note:36': 'toggleBlock',
    'note:37': 'setActiveScript',
    'note:38': 'hush',
    'note:39': 'nextTab',
    // Named controls from the device map (see device-map.js). The transport
    // buttons are where a performer's hand already goes for start and stop,
    // and the crossfader beside them sets how many cycles it takes.
    'apc40.global.play': 'armPlay',
    'apc40.global.stop': 'armStop',
    // The bank arrows sit under the same hand as the transport, and stepping
    // through songs is the other thing that hand does. Bank DOWN is dead on
    // this unit (see the map's faults), so only left/right and up are bound.
    'apc40.global.left': 'prevTab',
    'apc40.global.right': 'nextTab',
  };
}

export function resolveAction(map, trigger) {
  return map[trigger] ?? null;
}

/** How many hold-to-unmute keys exist. Fixed: they are physical buttons. */
export const HOLD_SLOTS = 5;

/**
 * Hold-to-unmute slots: five momentary "unmute block" buttons, each a
 * `{ trigger, blockIndex }` pair. Both halves are configurable - which key you
 * hold, and which block of the active song it makes live.
 *
 * They cannot live in the action map above because they are momentary rather
 * than one-shot: an action fires once on press, whereas these need the press
 * AND the release. F1-F5 are the defaults because they are unmodified, unused
 * by the editor, and sit in a row under the fingers.
 */
export function defaultHoldSlots() {
  return Array.from({ length: HOLD_SLOTS }, (_, i) => ({
    trigger: `key:F${i + 1}`,
    blockIndex: i,
  }));
}

/** The block index a trigger should unmute while held, or null. */
export function resolveHold(slots, trigger) {
  // Without the falsy guard an UNBOUND slot (trigger: null) would match a
  // key that produced no trigger, and quietly unmute its block.
  if (!trigger) return null;
  const slot = slots.find((s) => s.trigger === trigger);
  return slot ? slot.blockIndex : null;
}

/**
 * Rebinds one slot's key. Any OTHER slot already on that trigger is cleared,
 * so a single key can never unmute two blocks at once.
 */
export function setHoldTrigger(slots, slot, trigger) {
  return slots.map((entry, i) => {
    if (i === slot) return { ...entry, trigger };
    if (trigger && entry.trigger === trigger) return { ...entry, trigger: null };
    return entry;
  });
}

/** Points one slot at a different block of the song. */
export function setHoldBlock(slots, slot, blockIndex) {
  return slots.map((entry, i) => (i === slot ? { ...entry, blockIndex } : entry));
}

/**
 * Default momentary keys for the tab at position `position` (0-based): Alt+N
 * folds that tab's song into the mix while held, Ctrl+Alt+N plays it solo.
 *
 * Keyed by POSITION, not tab id, so a newly created tab is playable
 * immediately instead of dead until someone opens settings. Positions past
 * the ninth get nothing by default - there are no more digits - and are
 * bindable by hand.
 *
 * Caveat worth knowing on Windows: Ctrl+Alt is AltGr on some layouts, which
 * can make `event.key` a symbol rather than the digit. Every binding here is
 * rebindable for exactly that reason.
 */
export function defaultTabHoldTriggers(position) {
  if (position >= 9) return { add: null, solo: null };
  return { add: `key:Alt+${position + 1}`, solo: `key:Ctrl+Alt+${position + 1}` };
}

/**
 * Builds the live binding table from the current tabs plus any user overrides
 * (keyed by tab id, so a rebinding follows its tab rather than its position).
 */
export function tabHoldBindings(tabs, overrides = {}) {
  return tabs.map((tab, position) => ({
    tabId: tab.id,
    name: tab.name,
    ...defaultTabHoldTriggers(position),
    ...(overrides[tab.id] ?? {}),
  }));
}

/** Which tab a trigger plays while held, and how. */
export function resolveTabHold(bindings, trigger) {
  if (!trigger) return null;
  for (const binding of bindings) {
    // Solo is checked first: if one key is somehow bound to both, the more
    // specific intent wins rather than silently doing the weaker thing.
    if (binding.solo === trigger) return { tabId: binding.tabId, mode: 'solo' };
    if (binding.add === trigger) return { tabId: binding.tabId, mode: 'add' };
  }
  return null;
}

/**
 * Records a rebinding. The trigger is cleared from every other tab and mode
 * first, so one key can never drive two different things at once.
 */
export function setTabHoldTrigger(overrides, bindings, tabId, mode, trigger) {
  const next = {};
  for (const binding of bindings) {
    const entry = { add: binding.add, solo: binding.solo };
    if (trigger) {
      if (entry.add === trigger) entry.add = null;
      if (entry.solo === trigger) entry.solo = null;
    }
    if (binding.tabId === tabId) entry[mode] = trigger;
    next[binding.tabId] = entry;
  }
  return { ...overrides, ...next };
}

/**
 * Counts rapid repeats of one control, so a destructive action can be put
 * behind a deliberate gesture rather than a single press.
 *
 * The APC40's buttons are large and close together; deleting a song on one
 * press would be one fumble away at all times. Three taps inside `windowMs`
 * of each other is hard to do by accident and easy to do on purpose.
 *
 * The run resets on firing, so a fourth tap begins a new count rather than
 * deleting a second tab.
 */
export function createTapGate({ taps = 3, windowMs = 600 } = {}) {
  let count = 0;
  let last = -Infinity;
  return {
    tap(now) {
      count = now - last <= windowMs ? count + 1 : 1;
      last = now;
      if (count < taps) return false;
      count = 0;
      return true;
    },
    /** How far into the gesture we are - for showing progress. */
    pending: () => count,
    /**
     * Abandon a half-finished gesture.
     *
     * A gate shared between sessions carries the count across them: one press
     * in the first, and the first press of the next is read as the second tap
     * of a gesture nobody is still making.
     */
    reset() {
      count = 0;
      last = -Infinity;
    },
  };
}
