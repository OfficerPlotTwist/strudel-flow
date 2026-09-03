/**
 * Ripping a block out of a song: fade it to silence over four cycles, then
 * take the text somewhere else.
 *
 * Everything here is pure text-in / text-out. The *timing* lives in live.js
 * (which renders the fade into what the parser sees) and main.js (which
 * schedules the landing); keeping the transformation itself pure is what makes
 * it testable without an audio context.
 */

/** How many cycles a rip takes to fall silent. Fixed: it is the feature. */
export const RIP_CYCLES = 4;

/**
 * Does this block make sound? A comment, a `setcpm`, a `samples()` await -
 * these are statements, not patterns, and appending a gain chain to one is a
 * syntax error rather than a fade. They are ripped instantly instead.
 */
export function isFadeable(lines, block) {
  let sawCode = false;
  for (let i = block.start; i <= block.end; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    sawCode = true;
    if (/^(setcpm|setcps|samples|await|hush)\b/.test(trimmed)) return false;
  }
  return sawCode;
}

/**
 * The chain appended to a fading block.
 *
 * `isaw` runs 1 -> 0, slowed to span RIP_CYCLES. Left alone it would be
 * wherever the free-running clock has it - a rip started three cycles into the
 * window would begin at a quarter volume, an audible lurch. `.late(phase)`
 * slides the ramp so its 1 lands on the cycle the key was pressed, which is
 * what makes the fade start at full volume and start *instantly* rather than
 * waiting for the next bar line.
 *
 * `.mul(gain(...))` rather than `.gain(...)`: a plain `.gain()` at the end of
 * the chain replaces whatever gain the block set for itself, so a quiet part
 * would jump to full volume before fading. `mul` scales what is already there.
 */
export function fadeChain(cycle) {
  const phase = ((cycle % RIP_CYCLES) + RIP_CYCLES) % RIP_CYCLES;
  return `.mul(gain(isaw.slow(${RIP_CYCLES}).late(${phase.toFixed(4)})))`;
}

/**
 * Appends the fade chain to each fadeable block, and reports where text was
 * inserted so mini-notation offsets can be corrected afterwards.
 *
 * `edits` are `{ at, length }` in the offsets of the RETURNED text: the
 * transpiler will report locations against this rendered source, but the
 * highlights are painted over the user's untouched buffer. Subtracting these
 * insertions is what keeps the two aligned - see `unshiftLocations`.
 */
export function applyFade(lines, blocks, cycle) {
  const chain = fadeChain(cycle);
  const targets = blocks.filter((b) => isFadeable(lines, b));
  if (targets.length === 0) return { lines, edits: [] };

  const next = [...lines];
  const edits = [];
  // Offsets are computed on the ORIGINAL line lengths and then corrected by
  // the insertions already made above them, so the walk stays single-pass.
  let inserted = 0;
  const byLine = new Map(targets.map((b) => [b.end, b]));
  let offset = 0;
  for (let i = 0; i < next.length; i += 1) {
    const lineLength = next[i].length;
    if (byLine.has(i)) {
      const at = offset + lineLength + inserted;
      next[i] += chain;
      edits.push({ at, length: chain.length });
      inserted += chain.length;
    }
    offset += lineLength + 1; // +1 for the newline join
  }
  return { lines: next, edits };
}

/**
 * Maps a location reported against faded source back onto the untouched
 * buffer. A location that lands *inside* an inserted chain has no counterpart
 * in the buffer at all and is dropped - it would otherwise paint an outline
 * over whatever character happened to sit at that offset.
 */
export function unshiftLocations(locations, edits) {
  if (!edits.length) return locations;
  const out = [];
  for (const [from, to] of locations) {
    let shift = 0;
    let inside = false;
    for (const { at, length } of edits) {
      if (from >= at + length) shift += length;
      else if (from >= at) inside = true;
    }
    if (inside) continue;
    out.push([from - shift, to - shift]);
  }
  return out;
}

/** The ripped text, as it will appear at its destination. */
export function extractBlocks(lines, blocks) {
  return blocks
    .map((b) => lines.slice(b.start, b.end + 1).join('\n'))
    .join('\n\n')
    .trim();
}

/**
 * The song with those blocks gone. Blank lines that only existed to separate
 * a removed block from its neighbours go with it, so a rip never leaves a
 * growing gap where the block used to be.
 */
export function removeBlocks(lines, blocks) {
  const doomed = new Set();
  for (const b of blocks) {
    for (let i = b.start; i <= b.end; i += 1) doomed.add(i);
  }
  const kept = lines.filter((_, i) => !doomed.has(i));
  // Collapse any run of blank lines the removal opened up, and trim the ends.
  const out = [];
  for (const line of kept) {
    if (line.trim() === '' && out.length && out[out.length - 1].trim() === '') continue;
    out.push(line);
  }
  while (out.length && out[0].trim() === '') out.shift();
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out;
}
