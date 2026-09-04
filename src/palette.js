/**
 * One stable colour per function name, shared by the editor and the explainer.
 *
 * Neither side passes a colour to the other: both ask this for the same name
 * and get the same answer, which is what makes the word in the explainer and
 * the word in the code recognisably the same thing.
 *
 * The hues are a narrow band around the phosphor green rather than a full
 * spectrum. The point is to tell two functions apart at a glance, not to turn
 * a CRT into a syntax-highlighted IDE - a red keyword on this screen would
 * read as an error, because `--alert` is the only warm colour the app uses.
 */

/** Phosphor-adjacent hues: green through cyan into a cold blue. */
export const HUES = [140, 165, 120, 185, 100, 200, 150, 175, 130, 210, 110, 195];

/** Deterministic, order-independent hash - the same name always lands the same. */
function hueOf(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return HUES[hash % HUES.length];
}

/**
 * `live` is whether this function appears in a block that is actually
 * playing. An inactive block keeps the hue and loses the brightness, so it
 * still reads as the same function - a different hue would say it was a
 * different one.
 */
export function functionColor(name, live = true) {
  const hue = hueOf(name);
  return live ? `hsl(${hue}, 72%, 72%)` : `hsl(${hue}, 38%, 42%)`;
}
