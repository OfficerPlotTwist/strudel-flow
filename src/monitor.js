/**
 * The monitor bus: hearing the block you are building without the room
 * hearing it.
 *
 * This is a DJ headphone cue, and the reason it can exist at all is that
 * superdough already routes audio per orbit to named output channels - see
 * node_modules/superdough/superdoughoutput.mjs, where SuperdoughOutput sizes a
 * ChannelMergerNode to `destination.maxChannelCount` and `getOrbit(n, channels)`
 * splits an orbit into specific ones. So the split does not need a second
 * AudioContext, a MediaStreamDestination, or an <audio> element with
 * setSinkId: it needs the block under construction to carry `.orbit()` and
 * `.channels()` naming a pair the mains are not listening to.
 *
 * That distinction matters for what it costs. A second audio graph would mean
 * a parallel scheduler, a second set of sample buffers, and two clocks to keep
 * in phase. This is a suffix on one pattern.
 *
 * The hardware requirement is real and cannot be faked: a cue needs an
 * interface with at least four output channels. `splitAvailable` reports
 * whether this machine has one, and nothing here pretends otherwise - sending
 * the cue to channels that do not exist would silently fold it back into the
 * mains, which is the exact failure a cue exists to prevent.
 */

/**
 * The orbit the monitor uses. High on purpose: orbits are a global effect
 * context, and sharing one with a part of the song would put the song's reverb
 * on the cue and the cue's on the song.
 */
export const MONITOR_ORBIT = 9;

/** Mains and cue, as 1-based interface channels. */
export const DEFAULT_MASTER_CHANNELS = [1, 2];
export const DEFAULT_MONITOR_CHANNELS = [3, 4];

/**
 * How many output channels this machine can actually address.
 *
 * `maxChannelCount` is the device's own claim, and it is the only honest
 * source: a 2-channel laptop output reports 2 no matter what the settings say
 * anyone would like.
 */
export function outputChannelCount(audioContext) {
  return audioContext?.destination?.maxChannelCount ?? 0;
}

/**
 * Can master and monitor genuinely go to different outputs here?
 *
 * Four channels is the floor: two for the mains and two for the cue. Anything
 * less and there is one stereo pair, which both would have to share.
 */
export function splitAvailable(audioContext, monitorChannels = DEFAULT_MONITOR_CHANNELS) {
  return outputChannelCount(audioContext) >= Math.max(...monitorChannels);
}

/**
 * Why the split is or is not available, in one line, for the status strip.
 *
 * Worth spelling out rather than reducing to a boolean: "2 of 4 channels" is
 * actionable - plug in an interface - and "unavailable" is not.
 */
export function splitStatus(audioContext, monitorChannels = DEFAULT_MONITOR_CHANNELS) {
  const count = outputChannelCount(audioContext);
  const need = Math.max(...monitorChannels);
  if (count === 0) return 'no audio output';
  if (count >= need) return `monitor on ${monitorChannels.join('/')} of ${count} channels`;
  return `monitor needs ${need} channels, output has ${count}`;
}

/**
 * The suffix that sends a pattern to the cue instead of the mains.
 *
 * Appended to the rendered source rather than applied to a Pattern object,
 * because everything reaching the parser in this app is text (see live.js) -
 * and text is also what makes it visible in a rip or an error message.
 */
export function monitorSuffix(monitorChannels = DEFAULT_MONITOR_CHANNELS) {
  return `.orbit(${MONITOR_ORBIT}).channels("${monitorChannels.join(' ')}")`;
}

/**
 * Wraps one block's source so it plays to the cue.
 *
 * The whole block becomes the argument of a `stack(...)`, so the suffix lands
 * on the finished pattern rather than being chained onto whatever the last
 * line happened to be - a block ending in a comment, or in a `.jux(...)` whose
 * closing paren is on its own line, would otherwise take the suffix inside
 * something it does not belong in.
 */
export function toMonitor(blockText, monitorChannels = DEFAULT_MONITOR_CHANNELS) {
  const trimmed = blockText.replace(/\s+$/, '');
  // A labelled statement (`$: ...`) is already a voice; the label has to stay
  // outside the wrapper or the result is `stack($: ...)`, which is not JS.
  const labelled = /^(\s*(?:\$|[a-z]\w*)\s*:\s*)([\s\S]*)$/.exec(trimmed);
  const label = labelled ? labelled[1] : '';
  const body = labelled ? labelled[2] : trimmed;
  return `${label}stack(\n${body}\n)${monitorSuffix(monitorChannels)}`;
}
