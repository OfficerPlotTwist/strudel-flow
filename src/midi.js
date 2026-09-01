import { WebMidi, enableWebMidi } from '@strudel/midi';

let enabled = false;
let enablePromise = null;

/**
 * Returns true if Web MIDI is available and permission was granted.
 *
 * Strudel's enableWebMidi() is idempotent (sysex always requested), but its
 * return value is not a reliable "ports are populated" signal on its own:
 * when WebMidi is already enabled it returns `undefined` synchronously
 * instead of a Promise. In that case WebMidi.outputs/inputs are already
 * populated from the prior enable, so that path is safe too - but rather
 * than rely on that inference, we drive resolution explicitly off the
 * onEnabled callback, which webmidi only fires after it has finished
 * building the inputs/outputs lists.
 */
export async function enableMidi() {
  if (enabled) return true;
  if (typeof navigator.requestMIDIAccess !== 'function') return false;
  if (!enablePromise) {
    enablePromise = new Promise((resolve, reject) => {
      if (WebMidi.enabled) {
        resolve();
        return;
      }
      const result = enableWebMidi({
        onEnabled: () => resolve(),
      });
      result?.catch(reject);
    });
  }
  try {
    await enablePromise;
    enabled = true;
    return true;
  } catch (err) {
    console.warn('[midi] enable failed', err);
    enablePromise = null;
    return false;
  }
}

export function listOutputs() {
  return enabled ? WebMidi.outputs.map((o) => o.name) : [];
}

export function listInputs() {
  return enabled ? WebMidi.inputs.map((i) => i.name) : [];
}

/** Subscribe to raw MIDI messages from a named input port. */
export function onMidiMessage(portName, handler) {
  const input = WebMidi.inputs.find((i) => i.name.includes(portName));
  if (!input) {
    console.warn(`[midi] input "${portName}" not found`);
    return;
  }
  input.addListener('midimessage', (e) => handler(e.message.data));
}
