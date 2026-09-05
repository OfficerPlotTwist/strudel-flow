import { describe, expect, it } from 'vitest';
import { BEATS_PER_CYCLE, beatIndex, createAudition } from '../src/audition.js';

describe('beatIndex', () => {
  it('counts four beats to a cycle', () => {
    // A Strudel cycle is conventionally the bar, so a beat is a quarter of it.
    expect(BEATS_PER_CYCLE).toBe(4);
    expect(beatIndex(0, 0.5)).toBe(0);
    expect(beatIndex(0.5, 0.5)).toBe(1);
    expect(beatIndex(2, 0.5)).toBe(4);
  });

  it('speeds up with the tempo', () => {
    expect(beatIndex(1, 1)).toBe(4);
    expect(beatIndex(1, 2)).toBe(8);
  });

  it('does not divide by a missing tempo', () => {
    expect(Number.isFinite(beatIndex(1, 0))).toBe(true);
    expect(Number.isFinite(beatIndex(1, null))).toBe(true);
  });
});

describe('createAudition', () => {
  const setup = () => {
    const played = [];
    let now = 0;
    let sound = 'bd';
    const audition = createAudition({
      play: (name) => played.push(name),
      getSound: () => sound,
      getCps: () => 0.5,
      now: () => now,
    });
    return {
      played,
      audition,
      advance: (seconds) => {
        now += seconds;
      },
      setSound: (name) => {
        sound = name;
      },
    };
  };

  it('is off until switched on', () => {
    const { audition, played, advance } = setup();
    expect(audition.isOn()).toBe(false);
    advance(10);
    audition.tick();
    expect(played).toEqual([]);
  });

  it('plays the highlighted sound once per beat', () => {
    const { audition, played, advance } = setup();
    audition.toggle();
    advance(0.5); // one beat at cps 0.5
    audition.tick();
    advance(0.5);
    audition.tick();
    expect(played).toEqual(['bd', 'bd']);
  });

  it('does not fire twice inside one beat', () => {
    // The tick runs far faster than the beat so the pulse stays tight; only a
    // change of beat is a trigger.
    const { audition, played, advance } = setup();
    audition.toggle();
    advance(0.5);
    audition.tick();
    advance(0.1);
    audition.tick();
    audition.tick();
    expect(played).toEqual(['bd']);
  });

  it('follows the highlight as it moves', () => {
    const { audition, played, advance, setSound } = setup();
    audition.toggle();
    advance(0.5);
    audition.tick();
    setSound('cp');
    advance(0.5);
    audition.tick();
    expect(played).toEqual(['bd', 'cp']);
  });

  it('plays nothing when no sound is highlighted', () => {
    const { audition, played, advance, setSound } = setup();
    audition.toggle();
    setSound(null);
    advance(0.5);
    audition.tick();
    expect(played).toEqual([]);
  });

  it('stops on the second press', () => {
    const { audition, played, advance } = setup();
    expect(audition.toggle()).toBe(true);
    advance(0.5);
    audition.tick();
    expect(audition.toggle()).toBe(false);
    advance(0.5);
    audition.tick();
    expect(played).toEqual(['bd']);
  });

  it('takes the state from the device rather than counting presses', () => {
    // SEND C latches on the APC40: press once and it sends velocity 1, press
    // again and it sends 0. The app must AGREE with that, not keep a second
    // count - counting is what made a full on-and-off take four presses.
    const { audition, played, advance } = setup();
    expect(audition.setOn(true)).toBe(true);
    advance(0.5);
    audition.tick();
    // The same state arriving twice is not a second press. It must not turn
    // the audition off, and it must not re-anchor the beat and skip one.
    expect(audition.setOn(true)).toBe(true);
    advance(0.25);
    audition.tick();
    // Half a beat after a redundant ON. If that call had re-anchored the beat
    // clock, this tick would be silent.
    advance(0.25);
    audition.tick();
    expect(played).toEqual(['bd', 'bd']);

    expect(audition.setOn(false)).toBe(false);
    advance(0.5);
    audition.tick();
    expect(audition.setOn(false)).toBe(false);
    advance(0.5);
    audition.tick();
    expect(played).toEqual(['bd', 'bd']);
  });

  it('does not fire a burst for the time it was switched off', () => {
    // Switching on after a long silence must not replay every beat that
    // elapsed while it was off.
    const { audition, played, advance } = setup();
    advance(60);
    audition.toggle();
    audition.tick();
    expect(played).toEqual([]);
    advance(0.5);
    audition.tick();
    expect(played).toEqual(['bd']);
  });
});
