/**
 * Queries a bare Strudel pitch expression and returns its MIDI fingerprint.
 *
 * Lives here, served by Vite, because @strudel/core cannot be imported from
 * node - its package resolution lands on a browser build that pulls
 * @kabelsalat/web and dies. Importing it through the dev server is the only
 * way to reach the real pattern engine, so the pitch verifiers drive a page.
 */
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
mini.miniAllStrings?.();
const scope = { ...core, ...mini, ...tonal };
export function pitches(src, cycles = 4) {
  const f = new Function(...Object.keys(scope), `return (${src});`);
  return f(...Object.values(scope))
    .queryArc(0, cycles)
    .map((h) => {
      const v = h.value.note ?? h.value.n;
      return `${Number(h.whole.begin).toFixed(4)}:${typeof v === 'string' ? core.noteToMidi(v) : v}`;
    })
    .sort();
}
