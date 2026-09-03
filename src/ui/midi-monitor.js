import { emptyProbe, observe, report, reportText } from '../midi-probe.js';

/** Screen refresh, in ms. A knob sweep sends far faster than anyone can read. */
const REDRAW_MS = 100;

/**
 * A live map of whatever controller is plugged in.
 *
 * Turn every knob, push every pad, and this fills in with the CC and note
 * numbers the surface actually sends, what kind of control each one is, and
 * how fast it sends. That map is what the bindings are written against - the
 * alternative is hard-coding numbers from a manual and finding out mid-set
 * that this unit disagrees.
 *
 * Sits inside the settings pane and costs nothing while collapsed: messages
 * are still folded into the probe (so a sweep done before opening the panel is
 * not lost), but nothing is drawn.
 */
export function createMidiMonitor(container) {
  let probe = emptyProbe();
  let dirty = false;
  let timer = null;

  const panel = document.createElement('details');
  panel.className = 'settings midi-monitor';
  const summary = document.createElement('summary');
  summary.textContent = 'MIDI MONITOR';
  panel.append(summary);

  const help = document.createElement('p');
  help.className = 'settings-note';
  help.textContent =
    'Listens to EVERY MIDI input, not just the chosen control surface — so this ' +
    'also answers which port the controller is on. Turn each knob end to end and ' +
    'press each pad; rows fill in as they are seen.';

  const table = document.createElement('table');
  table.className = 'trigger-map monitor-table';

  const buttons = document.createElement('div');
  const resetBtn = document.createElement('button');
  resetBtn.className = 'settings-insert';
  resetBtn.textContent = 'RESET';
  resetBtn.addEventListener('click', () => {
    probe = emptyProbe();
    draw();
  });
  const copyBtn = document.createElement('button');
  copyBtn.className = 'settings-insert';
  copyBtn.textContent = 'COPY MAP';
  copyBtn.addEventListener('click', async () => {
    const text = reportText(probe);
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = 'COPIED';
    } catch {
      // Clipboard access can be refused (no permission, not a user gesture the
      // browser trusts). The map is the point, so fall back to somewhere it
      // can still be read and copied by hand rather than losing it.
      console.log(text);
      copyBtn.textContent = 'IN CONSOLE';
    }
    setTimeout(() => {
      copyBtn.textContent = 'COPY MAP';
    }, 1500);
  });
  buttons.append(resetBtn, copyBtn);

  function draw() {
    dirty = false;
    table.replaceChildren();
    const header = document.createElement('tr');
    for (const text of ['control', 'port', 'ch', 'n', 'range', 'last', 'rate', 'looks like']) {
      const cell = document.createElement('th');
      cell.textContent = text;
      header.append(cell);
    }
    table.append(header);

    const rows = report(probe);
    if (rows.length === 0) {
      const empty = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.textContent = 'nothing seen yet — move a control';
      empty.append(cell);
      table.append(empty);
      return;
    }
    for (const row of rows) {
      const tr = document.createElement('tr');
      const cells = [
        row.key,
        row.port ?? '?',
        String(row.channel + 1),
        String(row.count),
        row.min === null ? '—' : `${row.min}..${row.max}`,
        row.last === null ? '—' : String(row.last),
        row.medianGapMs === null ? '—' : `${row.medianGapMs}ms`,
        row.kind,
      ];
      for (const text of cells) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      }
      table.append(tr);
    }
  }

  // Redraw on a timer rather than per message. A knob sweep delivers hundreds
  // of messages a second, and rebuilding the table on each one would spend
  // more time in layout than the audio thread can spare.
  function schedule() {
    if (!panel.open || timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (dirty) draw();
    }, REDRAW_MS);
  }

  panel.addEventListener('toggle', () => {
    if (panel.open) draw();
    else if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  });

  panel.append(help, buttons, table);
  container.append(panel);
  draw();

  return {
    /** Fold one raw MIDI message in. Safe to call while collapsed. */
    feed(data, port) {
      observe(probe, data, Date.now(), port);
      dirty = true;
      schedule();
    },
    /** The map as text, for logging it somewhere durable. */
    text: () => reportText(probe),
  };
}
