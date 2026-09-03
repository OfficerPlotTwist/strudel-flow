const isBlank = (line) => line.trim() === '';
const COMMENT = '// ';

/**
 * A block is the run of contiguous non-blank lines containing the cursor.
 * Returns null if the cursor sits on a blank line.
 */
export function findBlock(lines, cursorLine) {
  if (cursorLine < 0 || cursorLine >= lines.length) return null;
  if (isBlank(lines[cursorLine])) return null;

  let start = cursorLine;
  while (start > 0 && !isBlank(lines[start - 1])) start -= 1;

  let end = cursorLine;
  while (end < lines.length - 1 && !isBlank(lines[end + 1])) end += 1;

  return { start, end };
}

/**
 * Does `code` stand on its own, or is it a fragment meant to be chained onto
 * something else?
 *
 * This decides HOW library content is inserted, and getting it wrong produces
 * exactly the syntax errors it exists to prevent: splicing a whole multi-line
 * pattern into the middle of a line welds two statements together
 * (`$: s` + `setcpm(...)` -> `$: ssetcpm(...)`), while putting a bare `.gain(0.5)`
 * on its own line is an orphan with nothing to attach to.
 *
 * A block is anything spanning multiple lines, or anything opening with a
 * statement keyword. A fragment is the leading-dot method chain everything
 * else looks like.
 */
export function isStandaloneBlock(code) {
  const trimmed = code.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('.')) return false;
  if (trimmed.includes('\n')) return true;
  // Two patterns, not one: `\b` after a label like `$:` never matches, because
  // a colon followed by a space is not a word boundary.
  if (/^(\$|[a-z]\w*)\s*:/.test(trimmed)) return true;
  return /^(setcpm|setcps|samples|await|hush)\b/.test(trimmed);
}

/** Every block in the file, in source order. Index N here is "block N". */
export function listBlocks(lines) {
  const blocks = [];
  let start = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (isBlank(lines[i])) {
      if (start !== null) blocks.push({ start, end: i - 1 });
      start = null;
    } else if (start === null) {
      start = i;
    }
  }
  if (start !== null) blocks.push({ start, end: lines.length - 1 });
  return blocks;
}

/**
 * Every block touched by the line range [fromLine, toLine], in order. A
 * selection that starts or ends on a blank line still picks up the blocks it
 * genuinely covers - only a selection lying entirely in blank space is empty.
 */
export function findBlocksInRange(lines, fromLine, toLine) {
  const lo = Math.min(fromLine, toLine);
  const hi = Math.max(fromLine, toLine);
  return listBlocks(lines).filter((block) => block.start <= hi && block.end >= lo);
}

export function isBlockCommented(lines, start, end) {
  for (let i = start; i <= end; i += 1) {
    if (!lines[i].trimStart().startsWith(COMMENT)) return false;
  }
  return true;
}

/**
 * Toggles `// ` on every line of the block, after its leading whitespace so
 * indentation survives a round trip. A partially commented block is commented,
 * not restored — matching editor convention.
 */
export function toggleBlockComment(lines, start, end) {
  const restoring = isBlockCommented(lines, start, end);
  const next = [...lines];
  for (let i = start; i <= end; i += 1) {
    const line = next[i];
    const indent = line.slice(0, line.length - line.trimStart().length);
    const body = line.slice(indent.length);
    next[i] = restoring ? indent + body.slice(COMMENT.length) : indent + COMMENT + body;
  }
  return next;
}

/**
 * Toggles a whole set of blocks as one unit. The direction is decided across
 * the selection, not per block: it only restores when EVERY selected block is
 * fully commented, and otherwise comments them all. Toggling each block
 * independently would make a mixed selection flip half on and half off, which
 * is never what a single keystroke should mean - and this is exactly the
 * existing single-block "partially commented → comment" rule, one level up.
 */
export function toggleBlocksComment(lines, blocks) {
  if (blocks.length === 0) return lines;
  const restoring = blocks.every((b) => isBlockCommented(lines, b.start, b.end));
  let next = lines;
  for (const block of blocks) {
    // Already in the target state (a mixed selection being commented): leave
    // it alone rather than double-commenting the lines that were fine.
    if (isBlockCommented(next, block.start, block.end) === restoring) {
      next = toggleBlockComment(next, block.start, block.end);
    }
  }
  return next;
}

/**
 * Produces the source to SEND TO THE PARSER with the given blocks temporarily
 * live, leaving the editor buffer untouched. Used by the hold-to-unmute keys.
 *
 * The comment marker is replaced by spaces rather than deleted, so the result
 * is byte-for-byte the same length as the buffer. That is not cosmetic: the
 * transpiler reports mini-notation locations as offsets into the code it was
 * given, and those offsets are painted as highlights over the buffer the user
 * is looking at. Deleting three characters per line would slide every
 * highlight after the unmuted block out of place.
 */
export function uncommentForPlayback(lines, blocks) {
  let next = [...lines];
  for (const block of blocks) {
    if (!isBlockCommented(next, block.start, block.end)) continue;
    for (let i = block.start; i <= block.end; i += 1) {
      const line = next[i];
      const indent = line.slice(0, line.length - line.trimStart().length);
      const body = line.slice(indent.length);
      next[i] = indent + ' '.repeat(COMMENT.length) + body.slice(COMMENT.length);
    }
  }
  return next;
}
