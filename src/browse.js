/**
 * Moving around a song, and around the library, from the control surface.
 *
 * The block cursor is what the cue encoder drives: one block of the current
 * song is under the cursor at any moment, and that block IS the selection.
 * Scrolling on leaves the previous block behind - unless REC pinned it, which
 * is the whole of what "keeps current block selected" means. So the selection
 * is every pinned block plus wherever the cursor is now.
 *
 * Blocks are addressed by INDEX, the same currency live.js and the hold slots
 * speak. That is deliberate and it is also the thing to be careful about: an
 * edit or a rip can shorten the song underneath a pinned set, so every read
 * takes the current block count and drops whatever no longer names a block.
 */

/**
 * Step through a list of `count` items, wrapping at both ends.
 *
 * Wrapping rather than clamping because these are endless encoders and
 * buttons that cycle: there is no rail to feel, so a cursor that stopped
 * silently at the end would just look broken.
 */
export function wrapIndex(index, delta, count) {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}

export function createBlockCursor() {
  let cursor = 0;
  const pinned = new Set();

  return {
    get cursor() {
      return cursor;
    },

    /** Move the cursor by `delta` blocks through a song of `count` blocks. */
    move(delta, count) {
      cursor = wrapIndex(cursor, delta, count);
      return cursor;
    },

    /**
     * Pin the block under the cursor, or let go of it if it was already
     * pinned. Toggling rather than only adding: a pin that could not be undone
     * would make one mis-press cost the whole selection.
     */
    latch() {
      if (pinned.has(cursor)) pinned.delete(cursor);
      else pinned.add(cursor);
      return pinned.has(cursor);
    },

    isPinned: (index) => pinned.has(index),

    /** Drop every pin and return to the top. */
    clear() {
      pinned.clear();
      cursor = 0;
    },

    /**
     * The selected block indexes, in block order, for a song of `count`
     * blocks. Indexes past the end are dropped rather than clamped - a stale
     * pin clamped to the last block would silently select something the user
     * never chose.
     */
    indexes(count) {
      if (count <= 0) return [];
      if (cursor >= count) cursor = count - 1;
      const live = [...pinned].filter((i) => i < count);
      return [...new Set([...live, cursor])].sort((a, b) => a - b);
    },
  };
}
