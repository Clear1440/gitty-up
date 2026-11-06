const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/** A range with no lines points at the line before it, by unified diff convention. */
const rangeStart = (firstLine, count) => (count === 0 ? Math.max(firstLine - 1, 0) : firstLine);

/** Splits a one-file diff into its header and hunks. `lines` keep their index in the diff. */
function parseHunks(diff) {
  const header = [];
  const hunks = [];

  diff.split('\n').forEach((text, index) => {
    const match = text.match(HUNK_HEADER);
    if (match) {
      const [, oldStart, oldCount = '1', newStart, newCount = '1', section] = match;
      hunks.push({
        // Without any lines on a side, git gives the line before. This is the line after.
        oldFirst: Number(oldStart) + (oldCount === '0' ? 1 : 0),
        newFirst: Number(newStart) + (newCount === '0' ? 1 : 0),
        section,
        lines: [],
      });
    } else if (hunks.length === 0) {
      header.push(text);
    } else if (/^[ +\-\\]/.test(text)) {
      hunks.at(-1).lines.push({ text, index });
    }
  });

  return { header, hunks };
}

/**
 * Rewrites one hunk to change only the selected lines. Everything else must match
 * what the patch applies to, which is the "before" side when staging and the
 * "after" side when unstaging, so lines missing there are dropped and lines present
 * there become context.
 */
function selectLines(hunk, selected, reverse) {
  const lines = [];
  let oldCount = 0;
  let newCount = 0;
  let hasChange = false;
  let keptPrevious = false;

  for (const { text, index } of hunk.lines) {
    const sign = text[0];
    const isChange = sign === '+' || sign === '-';

    if (sign === '\\') {
      // "No newline at end of file" describes the line before it.
      if (keptPrevious) lines.push(text);
      continue;
    }
    if (isChange && selected.has(index)) {
      hasChange = true;
      lines.push(text);
      if (sign === '+') newCount += 1;
      else oldCount += 1;
      keptPrevious = true;
      continue;
    }
    const isOnTargetSide = !isChange || (sign === '+' ? reverse : !reverse);
    keptPrevious = isOnTargetSide;
    if (isOnTargetSide) {
      lines.push(` ${text.slice(1)}`);
      oldCount += 1;
      newCount += 1;
    }
  }

  return hasChange ? { lines, oldCount, newCount } : null;
}

/**
 * A partial change to a new or deleted file leaves the file in place, so the patch
 * has to describe an edit, not the file appearing or disappearing.
 */
function adjustHeader(header, reverse) {
  const lineStarting = (prefix) => header.find((line) => line.startsWith(prefix));
  const pathLine = reverse ? lineStarting('+++ ') : lineStarting('--- ');
  const emptySide = reverse ? '--- /dev/null' : '+++ /dev/null';
  const fileMode = reverse ? 'new file mode' : 'deleted file mode';
  if (!header.includes(emptySide)) return header;

  const [from, to] = reverse ? ['b/', 'a/'] : ['a/', 'b/'];
  const prefix = reverse ? '--- ' : '+++ ';
  const path = pathLine.slice(4).replace(from, to);
  return header
    .filter((line) => !line.startsWith(fileMode))
    .map((line) => (line === emptySide ? `${prefix}${path}` : line));
}

/**
 * Builds a patch of only the selected lines of a one-file diff, or null if none of
 * them are changes. `selectedLines` holds line indexes into the diff.
 *
 * With `reverse` the patch is for `git apply --reverse`, to take lines back out.
 */
export function buildPatch(diff, selectedLines, { reverse = false } = {}) {
  const selected = new Set(selectedLines);
  const { header, hunks } = parseHunks(diff);

  const changeLines = hunks.flatMap((hunk) =>
    hunk.lines.filter(({ text }) => text[0] === '+' || text[0] === '-'),
  );
  const isPartial = changeLines.some(({ index }) => !selected.has(index));

  const body = [];
  // How far the two sides have drifted apart, given the changes kept so far.
  let drift = 0;

  for (const hunk of hunks) {
    const result = selectLines(hunk, selected, reverse);
    if (!result) continue;

    const { lines, oldCount, newCount } = result;
    // The side being applied to is unchanged, so its line numbers stay accurate.
    const oldFirst = Math.max(reverse ? hunk.newFirst - drift : hunk.oldFirst, 1);
    const newFirst = Math.max(reverse ? hunk.newFirst : hunk.oldFirst + drift, 1);
    const oldRange = `-${rangeStart(oldFirst, oldCount)},${oldCount}`;
    const newRange = `+${rangeStart(newFirst, newCount)},${newCount}`;

    body.push(`@@ ${oldRange} ${newRange} @@${hunk.section}`, ...lines);
    drift += newCount - oldCount;
  }

  if (body.length === 0) return null;
  return `${[...(isPartial ? adjustHeader(header, reverse) : header), ...body].join('\n')}\n`;
}
