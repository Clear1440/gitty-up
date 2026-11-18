// Past this, comparing two lines token by token costs more than the highlight is worth.
const MAX_LINE_LENGTH = 1_000;
const MAX_TOKENS = 400;
// Below this share of text in common, two lines are different lines, not an edit of one.
const MIN_SHARED = 0.4;

/** Words, runs of spaces, and single punctuation marks, so edits snap to whole words. */
const tokenize = (text) => text.match(/\w+|\s+|[^\w\s]/g) ?? [];

/** Which tokens of each side are in their longest common subsequence. */
function commonTokens(before, after) {
  const rows = before.length + 1;
  const columns = after.length + 1;
  const lengths = new Uint16Array(rows * columns);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      lengths[i * columns + j] =
        before[i] === after[j]
          ? lengths[(i + 1) * columns + j + 1] + 1
          : Math.max(lengths[(i + 1) * columns + j], lengths[i * columns + j + 1]);
    }
  }

  const keptBefore = new Array(before.length).fill(false);
  const keptAfter = new Array(after.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      keptBefore[i] = true;
      keptAfter[j] = true;
      i += 1;
      j += 1;
    } else if (lengths[(i + 1) * columns + j] >= lengths[i * columns + j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return { keptBefore, keptAfter };
}

/** Joins tokens into segments, merging neighbours that are both changed or both kept. */
function toSegments(tokens, kept) {
  const segments = [];
  tokens.forEach((text, index) => {
    const changed = !kept[index];
    const last = segments.at(-1);
    if (last?.changed === changed) last.text += text;
    else segments.push({ text, changed });
  });
  return segments;
}

const sharedLength = (tokens, kept) =>
  tokens.reduce((total, token, index) => total + (kept[index] && token.trim() ? token.length : 0), 0);

/**
 * Finds what changed within a line: `before` and `after` as `{ text, changed }` segments,
 * or null when they are too different, or too long, for a highlight to help.
 */
export function diffWords(before, after) {
  if (before === after) return null;
  if (before.length > MAX_LINE_LENGTH || after.length > MAX_LINE_LENGTH) return null;

  const beforeTokens = tokenize(before);
  const afterTokens = tokenize(after);
  if (beforeTokens.length > MAX_TOKENS || afterTokens.length > MAX_TOKENS) return null;

  const { keptBefore, keptAfter } = commonTokens(beforeTokens, afterTokens);
  const shared = sharedLength(beforeTokens, keptBefore);
  const longest = Math.max(before.trim().length, after.trim().length);
  if (longest === 0 || shared / longest < MIN_SHARED) return null;

  return {
    before: toSegments(beforeTokens, keptBefore),
    after: toSegments(afterTokens, keptAfter),
  };
}

/**
 * Marks what changed inside lines that were edited rather than replaced. In each run of
 * changes, the nth deleted line pairs with the nth added one, as the split view shows
 * them. Each line that has a highlight gets `segments`.
 *
 * Only lines that can be among the first `maxRows` rows on screen are compared, as a huge
 * diff shows no more than that and comparing every line of it could stall the page.
 * Either layout may be on show, so this counts the fewest rows either could put first.
 */
export function annotateWordChanges(hunks, { maxRows = Infinity } = {}) {
  // Rows before the current run of changes: one per context line, and one per pair of
  // changes, as the split view draws them. Hunk headers only add to that, so are left out.
  let rowsBefore = 0;
  for (const hunk of hunks) {
    if (rowsBefore >= maxRows) break;
    let deleted = [];
    let added = [];
    // Changes earlier in the same run, which the split view pairs with these.
    let runDeleted = 0;
    let runAdded = 0;

    const pairUp = () => {
      const firstRow = rowsBefore + Math.min(runDeleted, runAdded);
      const pairCount = Math.min(deleted.length, added.length, maxRows - firstRow);
      for (let index = 0; index < pairCount; index += 1) {
        const result = diffWords(deleted[index].text, added[index].text);
        if (!result) continue;
        deleted[index].segments = result.before;
        added[index].segments = result.after;
      }
      runDeleted += deleted.length;
      runAdded += added.length;
      deleted = [];
      added = [];
    };
    const endRun = () => {
      pairUp();
      rowsBefore += Math.max(runDeleted, runAdded);
      runDeleted = 0;
      runAdded = 0;
    };

    for (const line of hunk.lines) {
      if (line.kind === 'context') {
        endRun();
        rowsBefore += 1;
      }
      // A deletion after additions starts a new edit, as git lists deletions first.
      else if (line.kind === 'deleted' && added.length > 0) {
        pairUp();
        deleted.push(line);
      } else if (line.kind === 'deleted') deleted.push(line);
      else added.push(line);
    }
    endRun();
  }
  return hunks;
}
