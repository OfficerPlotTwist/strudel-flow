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
