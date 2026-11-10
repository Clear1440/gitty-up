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
 */
export function annotateWordChanges(hunks) {
  for (const hunk of hunks) {
    let deleted = [];
    let added = [];
    const flush = () => {
      deleted.forEach((line, index) => {
        const partner = added[index];
        if (!partner) return;
        const result = diffWords(line.text, partner.text);
        if (!result) return;
        line.segments = result.before;
        partner.segments = result.after;
      });
      deleted = [];
      added = [];
    };

    for (const line of hunk.lines) {
      if (line.kind === 'context') flush();
      // A deletion after additions starts a new edit, as git lists deletions first.
      else if (line.kind === 'deleted' && added.length > 0) {
        flush();
        deleted.push(line);
      } else if (line.kind === 'deleted') deleted.push(line);
      else added.push(line);
    }
    flush();
  }
  return hunks;
}
