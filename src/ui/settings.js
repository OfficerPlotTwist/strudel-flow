import { listInputs, listOutputs } from '../midi.js';

/**
 * Strudel patterns route MIDI themselves via `.midi('portName')`, matched by
 * substring and case-sensitively. This panel does not route MIDI on the
 * user's behalf - it only hands them the exact, correctly-spelled port name
 * so `onPortPick` can drop it into their script at the cursor.
 */
export function createSettings(container, { triggerMap, onPortPick }) {
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

  const inList = document.createElement('p');
  inList.className = 'settings-note';
  const inputs = listInputs();
  inList.textContent = inputs.length
    ? `MIDI in: ${inputs.join(', ')}`
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

  panel.append(outLabel, insertBtn, inList, mapTable);
  container.append(panel);
}
