/**
 * Auditioning a sound: while SEND C is lit, whatever is highlighted in the
 * SOUNDS list plays once a beat, so a bank can be browsed by ear instead of by
 * name.
 *
 * The pulse is free-running at the transport's tempo rather than locked to the
 * transport's position. A preview is not part of the arrangement - it has to
 * work while the set is stopped, which is exactly when someone is hunting for
 * a sample, and a clock that only ticks during playback would be silent then.
 * The cost is that the preview does not line up with the downbeat, which for
 * something you are listening THROUGH rather than TO is the right trade.
 */

/** A Strudel cycle is conventionally the bar, so a beat is a quarter of it. */
export const BEATS_PER_CYCLE = 4;

/** Which beat `seconds` falls in, at `cps` cycles per second. */
export function beatIndex(seconds, cps) {
  const rate = Number(cps);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.floor(seconds * rate * BEATS_PER_CYCLE);
}

/**
 * `tick()` is called far more often than a beat elapses; it fires only when
 * the beat number changes, which is what keeps the pulse tight without the
 * caller having to know the tempo.
 */
export function createAudition({ play, getSound, getCps, now }) {
  let on = false;
  let lastBeat = null;

  return {
    isOn: () => on,

    /** SEND C. Returns the new state. */
    toggle() {
      on = !on;
      // Anchor to the current beat rather than to zero, or switching on after
      // a minute of silence would count every beat that elapsed while it was
      // off and fire a burst.
      lastBeat = on ? beatIndex(now(), getCps()) : null;
      return on;
    },

    tick() {
      if (!on) return false;
      const beat = beatIndex(now(), getCps());
      if (beat === lastBeat) return false;
      lastBeat = beat;
      const sound = getSound();
      if (!sound) return false;
      play(sound);
      return true;
    },
  };
}
