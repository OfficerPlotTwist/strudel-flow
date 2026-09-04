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

/**
 * Write a control-change value to a named output port.
 *
 * The app has only ever read MIDI. This exists because making an absolute knob
 * behave like an encoder is a read-modify-write on the hardware: the knob's
 * value is a counter inside the APC40, and re-centering it means writing that
 * counter back (see relative.js). Silent by design when the port is missing -
 * an unplugged controller is the normal case, not an error worth a dialog.
 */
export function sendCC(portName, channel, controller, value) {
  if (!enabled) return false;
  const output = WebMidi.outputs.find((o) => o.name === portName);
  if (!output) return false;
  // webmidi channels are 1-based; every other channel number in this app comes
  // off the wire and is 0-based, so the conversion belongs here rather than in
  // each caller.
  output.channels[channel + 1].sendControlChange(controller, value);
  return true;
}

/**
 * Light (or extinguish) a pad on a named output port.
 *
 * The first thing this app writes that is not a knob position. On the APC40 a
 * clip pad is lit by sending it its own note-on, and the VELOCITY is the
 * colour rather than the brightness - see LED_OFF and friends below. A pad is
 * turned off by velocity 0, which is the MIDI spec's other way of writing a
 * note-off and is what the pad itself sends on release.
 *
 * Silent when the port is missing, like sendCC: an unplugged controller is the
 * normal case, not an error worth a dialog.
 */
export function sendNote(portName, channel, note, velocity) {
  if (!enabled) return false;
  const output = WebMidi.outputs.find((o) => o.name === portName);
  if (!output) return false;
  // webmidi channels are 1-based; everything else in this app is 0-based
  // because that is how it arrives off the wire.
  const target = output.channels[channel + 1];
  if (velocity > 0) target.sendNoteOn(note, { rawAttack: velocity });
  else target.sendNoteOff(note);
  return true;
}

/**
 * APC40 pad colours. The unit has one bi-colour LED per clip pad, so these
 * five values are the whole palette - there is no brightness and no other hue.
 */
export const LED = { off: 0, green: 1, greenBlink: 2, red: 3, redBlink: 4, yellow: 5, yellowBlink: 6 };

/** Subscribe to raw MIDI messages from a named input port. */
export function onMidiMessage(portName, handler) {
  const input = WebMidi.inputs.find((i) => i.name === portName);
  if (!input) {
    console.warn(`[midi] input "${portName}" not found`);
    return;
  }
  input.addListener('midimessage', (e) => handler(e.message.data));
}
