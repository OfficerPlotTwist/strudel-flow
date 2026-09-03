import { listInputs, listOutputs } from '../midi.js';
import {
  HOLD_SLOTS,
  keyEventToTrigger,
  setHoldBlock,
  setHoldTrigger,
  setTabHoldTrigger,
} from '../triggers.js';

/**
 * Turns the next keypress - or the next press on a mapped control surface -
 * into a trigger string. Used by every REBIND button: capturing the actual
 * event is the only way to get a binding that is guaranteed to match at
 * dispatch time, since `keyEventToTrigger` is also what reads the live
 * keypress. Escape cancels; Backspace clears the binding.
 *
 * `onCaptureControl` is optional, and absent whenever no mapped surface is
 * connected; without it this captures keys exactly as it always did. With it,
 * touching a pad binds that pad BY NAME (`apc40.track3.clip1`), which is the
 * only way to bind one of eighty per-track buttons without knowing that it is
 * note 55 on channel 2.
 */
function captureTrigger(button, onCaptured, onCaptureControl) {
  const original = button.textContent;
  button.textContent = onCaptureControl ? 'press a key or pad…' : 'press a key…';
  button.classList.add('capturing');
  const releaseControl = onCaptureControl?.((name) => finish(name)) ?? null;

  function finish(trigger) {
    window.removeEventListener('keydown', onKey, true);
    releaseControl?.();
    button.textContent = original;
    button.classList.remove('capturing');
    if (trigger !== undefined) onCaptured(trigger);
  }

  function onKey(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') return finish(undefined);
    if (event.key === 'Backspace') return finish(null);
    // A bare modifier is someone reaching for a chord, not the binding.
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
    finish(keyEventToTrigger(event));
  }

  // Capture phase, so this wins over the app's own global key handling while
  // a rebind is in progress.
  window.addEventListener('keydown', onKey, true);
}

// `key:` is noise on a keyboard binding - the label sits on a key button. A
// device name is left whole: `apc40.track3.clip1` IS the readable form, and
// trimming it to `track3.clip1` would lose which surface it belongs to.
const triggerLabel = (trigger) => (trigger ? trigger.replace(/^key:/, '') : '(unbound)');

/**
 * Strudel patterns route MIDI themselves via `.midi('portName')`, matched by
 * substring and case-sensitively. This panel does not route MIDI on the
 * user's behalf - it only hands them the exact, correctly-spelled port name
 * so `onPortPick` can drop it into their script at the cursor.
 */
export function createSettings(
  container,
  {
    triggerMap,
    onPortPick,
    getHoldSlots,
    onHoldSlotsChange,
    getTabHolds,
    onTabHoldsChange,
    getBlockLabels,
    getControlPort,
    onControlPortChange,
    onCaptureControl,
  },
) {
  const holdHint = onCaptureControl
    ? 'Click, then press the key or pad to hold. Esc cancels, Backspace unbinds.'
    : 'Click, then press the key to hold. Esc cancels, Backspace unbinds.';

  const panel = document.createElement('details');
  panel.className = 'settings';
  const summary = document.createElement('summary');
  summary.textContent = 'SETTINGS';
  panel.append(summary);

  const outLabel = document.createElement('label');
  outLabel.textContent = 'MIDI out port ';
  const outSelect = document.createElement('select');
  const outputs = listOutputs();
  if (outputs.length === 0) {
    const option = document.createElement('option');
    option.textContent = '(no outputs found)';
    outSelect.append(option);
    outSelect.disabled = true;
  } else {
    for (const name of outputs) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      if (name.includes('loopMIDI')) option.selected = true;
      outSelect.append(option);
    }
  }
  outSelect.addEventListener('change', () => onPortPick(outSelect.value));
  outLabel.append(outSelect);

  const insertBtn = document.createElement('button');
  insertBtn.className = 'settings-insert';
  insertBtn.textContent = 'INSERT .midi()';
  insertBtn.disabled = outputs.length === 0;
  insertBtn.addEventListener('click', () => onPortPick(outSelect.value));

  /**
   * Which MIDI input drives the APP - tabs, blocks, holds, actions. Exactly
   * one, and never the ones carrying pattern signal: a controller that is
   * feeding notes into a pattern through midin() must not also be flipping
   * tabs behind your back. Everything not chosen here is left untouched for
   * Strudel's own use.
   */
  const inputs = listInputs();
  const controlLabel = document.createElement('label');
  controlLabel.className = 'settings-note';
  controlLabel.textContent = 'MIDI control surface ';
  const controlSelect = document.createElement('select');
  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = inputs.length ? '(none)' : '(no inputs detected)';
  controlSelect.append(noneOption);
  for (const name of inputs) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    if (name === getControlPort()) option.selected = true;
    controlSelect.append(option);
  }
  controlSelect.addEventListener('change', () => onControlPortChange(controlSelect.value || null));
  controlLabel.append(controlSelect);

  const inList = document.createElement('p');
  inList.className = 'settings-note';
  inList.textContent = inputs.length
    ? `pattern inputs: ${inputs.filter((n) => n !== getControlPort()).join(', ') || 'none left'}`
    : 'MIDI in: none detected';

  const mapTable = document.createElement('table');
  mapTable.className = 'trigger-map';
  for (const [trigger, action] of Object.entries(triggerMap)) {
    const row = document.createElement('tr');
    const triggerCell = document.createElement('td');
    triggerCell.textContent = trigger;
    const actionCell = document.createElement('td');
    actionCell.textContent = action;
    row.append(triggerCell, actionCell);
    mapTable.append(row);
  }

  /**
   * The five momentary "unmute block" buttons. Each row is one slot: which key
   * you hold, and which block of the ACTIVE song it makes live while held.
   *
   * Block choices are re-read every time the section is rebuilt rather than
   * cached, because the song is being edited underneath this panel - blocks
   * appear, vanish and renumber constantly during a set.
   */
  function renderBlockHolds() {
    const section = document.createElement('table');
    section.className = 'hold-map';
    const labels = getBlockLabels();

    for (let slot = 0; slot < HOLD_SLOTS; slot += 1) {
      const entry = getHoldSlots()[slot];
      const row = document.createElement('tr');

      const keyCell = document.createElement('td');
      const keyBtn = document.createElement('button');
      keyBtn.className = 'hold-key';
      keyBtn.textContent = triggerLabel(entry.trigger);
      keyBtn.title = holdHint;
      keyBtn.addEventListener('click', () => {
        captureTrigger(
          keyBtn,
          (trigger) => {
            onHoldSlotsChange(setHoldTrigger(getHoldSlots(), slot, trigger));
            rebuild();
          },
          onCaptureControl,
        );
      });
      keyCell.append(keyBtn);

      const blockCell = document.createElement('td');
      const select = document.createElement('select');
      const count = Math.max(labels.length, entry.blockIndex + 1);
      for (let i = 0; i < count; i += 1) {
        const option = document.createElement('option');
        option.value = String(i);
        // A slot may point past the end of the current song - that is not an
        // error, just a block that is not there right now (it is coming back
        // when you uncomment it), so show it rather than silently retargeting.
        option.textContent = labels[i] ? `${i}: ${labels[i]}` : `${i}: (no such block)`;
        if (i === entry.blockIndex) option.selected = true;
        select.append(option);
      }
      select.addEventListener('change', () => {
        onHoldSlotsChange(setHoldBlock(getHoldSlots(), slot, Number(select.value)));
      });
      blockCell.append(select);

      row.append(keyCell, blockCell);
      section.append(row);
    }
    return section;
  }

  /**
   * Two momentary keys per song tab: ADD folds that tab's song into whatever
   * is already playing, SOLO plays it and suppresses every other tab.
   */
  function renderTabHolds() {
    const section = document.createElement('table');
    section.className = 'hold-map';

    const header = document.createElement('tr');
    for (const text of ['tab', 'add', 'solo']) {
      const cell = document.createElement('th');
      cell.textContent = text;
      header.append(cell);
    }
    section.append(header);

    for (const binding of getTabHolds()) {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.textContent = binding.name;
      row.append(nameCell);

      for (const mode of ['add', 'solo']) {
        const cell = document.createElement('td');
        const button = document.createElement('button');
        button.className = 'hold-key';
        button.textContent = triggerLabel(binding[mode]);
        button.title = holdHint;
        button.addEventListener('click', () => {
          captureTrigger(
            button,
            (trigger) => {
              onTabHoldsChange(setTabHoldTrigger({}, getTabHolds(), binding.tabId, mode, trigger));
              rebuild();
            },
            onCaptureControl,
          );
        });
        cell.append(button);
        row.append(cell);
      }
      section.append(row);
    }
    return section;
  }

  function heading(text) {
    const el = document.createElement('h3');
    el.className = 'settings-heading';
    el.textContent = text;
    return el;
  }

  // The hold sections read live state (blocks, tabs) that changes while the
  // panel is open, so they are rebuilt on every open rather than kept in sync.
  let dynamic = document.createElement('div');
  function rebuild() {
    const next = document.createElement('div');
    next.append(
      heading('HOLD TO UNMUTE BLOCK'),
      renderBlockHolds(),
      heading('HOLD TO PLAY TAB'),
      renderTabHolds(),
    );
    dynamic.replaceWith(next);
    dynamic = next;
  }

  panel.addEventListener('toggle', () => {
    if (panel.open) rebuild();
  });

  panel.append(outLabel, insertBtn, controlLabel, inList, dynamic, mapTable);
  container.append(panel);
  rebuild();
}
