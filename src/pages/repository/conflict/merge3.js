/**
 * A line-based three-way merge, kept free of UI code. It splits a conflicted file into
 * chunks that line up across the common ancestor and both sides, so the resolver can
 * show each side next to the result and know which lines are in conflict.
 */

// Past this many edits between two versions, lines between the first and last change
// are treated as all changed, which keeps memory in check on wildly different files.
const MAX_EDITS = 2_000;

/** A file's lines, without line endings, and whether it ends in a newline. */
export function splitLines(text) {
  if (!text) return { lines: [], finalNewline: false };
  const lines = text.split(/\r?\n/);
  const finalNewline = lines.at(-1) === '';
  if (finalNewline) lines.pop();
  return { lines, finalNewline };
}

/** The line ending a file uses: CRLF if any line has one. */
export function detectEol(...texts) {
  return texts.some((text) => text?.includes('\r\n')) ? '\r\n' : '\n';
}

export function joinLines(lines, { eol = '\n', finalNewline = true } = {}) {
  if (lines.length === 0) return '';
  return lines.join(eol) + (finalNewline ? eol : '');
}

/** Walks Myers' trace back from the end, collecting the diagonal moves: matched lines. */
function backtrack(trace, endD, n, m) {
  const matches = [];
  let x = n;
  let y = m;
  for (let d = endD; d > 0; d -= 1) {
    const snapshot = trace[d];
    const at = (k) => snapshot[k + d + 1];
    const k = x - y;
    const previousK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const previousX = at(previousK);
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      x -= 1;
      y -= 1;
      matches.push([x, y]);
    }
    x = previousX;
    y = previousY;
  }
  while (x > 0 && y > 0) {
    x -= 1;
    y -= 1;
    matches.push([x, y]);
  }
  return matches.reverse();
}

/** Myers' diff over two arrays of numbers. Resolves with matched index pairs, in order. */
function myers(a, b) {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return [];

  const max = Math.min(n + m, MAX_EDITS);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];

  for (let d = 0; d <= max; d += 1) {
    // The furthest reach of every diagonal after d - 1 edits, as backtracking needs it.
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
          ? v[offset + k + 1]
          : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, d, n, m);
    }
  }
  return [];
}

/**
 * For each line of `from`, the index of the line it matches in `to`, or -1. Matches
 * follow a longest common subsequence, so they only ever move forward.
 */
export function matchLines(from, to) {
  const matches = new Array(from.length).fill(-1);

  let start = 0;
  while (start < from.length && start < to.length && from[start] === to[start]) {
    matches[start] = start;
    start += 1;
  }
  let endFrom = from.length;
  let endTo = to.length;
  while (endFrom > start && endTo > start && from[endFrom - 1] === to[endTo - 1]) {
    endFrom -= 1;
    endTo -= 1;
    matches[endFrom] = endTo;
  }

  // Comparing numbers is much faster than comparing strings.
  const ids = new Map();
  const toId = (line) => {
    if (!ids.has(line)) ids.set(line, ids.size);
    return ids.get(line);
  };
  const middleFrom = from.slice(start, endFrom).map(toId);
  const middleTo = to.slice(start, endTo).map(toId);
  for (const [i, j] of myers(middleFrom, middleTo)) matches[start + i] = start + j;
  return matches;
}

const sameLines = (a, b) => a.length === b.length && a.every((line, index) => line === b[index]);

/**
 * Sorts out one stretch where the three versions differ. Lines both sides open or close
 * with alike are split off, so a conflict covers only the lines that really disagree.
 */
function classify(base, ours, theirs) {
  if (sameLines(ours, theirs)) {
    return [{ kind: sameLines(ours, base) ? 'stable' : 'both', base, ours, theirs }];
  }
  if (sameLines(ours, base)) return [{ kind: 'theirs', base, ours, theirs }];
  if (sameLines(theirs, base)) return [{ kind: 'ours', base, ours, theirs }];

  let head = 0;
  while (head < ours.length && head < theirs.length && ours[head] === theirs[head]) head += 1;
  let tail = 0;
  while (
    tail < ours.length - head &&
    tail < theirs.length - head &&
    ours[ours.length - 1 - tail] === theirs[theirs.length - 1 - tail]
  ) {
    tail += 1;
  }

  const shared = (lines) => ({ kind: 'both', base: [], ours: lines, theirs: lines });
  return [
    head > 0 && shared(ours.slice(0, head)),
    {
      kind: 'conflict',
      base,
      ours: ours.slice(head, ours.length - tail),
      theirs: theirs.slice(head, theirs.length - tail),
    },
    tail > 0 && shared(ours.slice(ours.length - tail)),
  ].filter(Boolean);
}

/**
 * Merges two versions of a file's lines that both came from `base`. Each chunk is one of:
 * - stable: no side changed these lines
 * - ours / theirs: only that side changed them, so its change is taken
 * - both: both sides made the same change
 * - conflict: the sides changed them differently
 */
export function merge3(base, ours, theirs) {
  const toOurs = matchLines(base, ours);
  const toTheirs = matchLines(base, theirs);
  const chunks = [];
  let i = 0;
  let a = 0;
  let b = 0;

  for (;;) {
    let run = 0;
    while (i + run < base.length && toOurs[i + run] === a + run && toTheirs[i + run] === b + run) {
      run += 1;
    }
    if (run > 0) {
      const lines = base.slice(i, i + run);
      chunks.push({ kind: 'stable', base: lines, ours: lines, theirs: lines });
      i += run;
      a += run;
      b += run;
    }
    if (i === base.length && a === ours.length && b === theirs.length) break;

    // The next base line both sides kept is where the versions agree again.
    let next = i;
    while (next < base.length && (toOurs[next] < 0 || toTheirs[next] < 0)) next += 1;
    const endA = next < base.length ? toOurs[next] : ours.length;
    const endB = next < base.length ? toTheirs[next] : theirs.length;
    if (next === i && endA === a && endB === b) break;

    chunks.push(
      ...classify(base.slice(i, next), ours.slice(a, endA), theirs.slice(b, endB)),
    );
    i = next;
    a = endA;
    b = endB;
  }

  // Splitting a conflict can leave stable chunks side by side, which read as one.
  return chunks.reduce((merged, chunk) => {
    const last = merged.at(-1);
    if (last?.kind === 'stable' && chunk.kind === 'stable') {
      const lines = [...last.ours, ...chunk.ours];
      merged[merged.length - 1] = { kind: 'stable', base: lines, ours: lines, theirs: lines };
    } else {
      merged.push(chunk);
    }
    return merged;
  }, []);
}

/** The lines a chunk starts with in the working file, or null for an open conflict. */
export function initialLines(chunk) {
  if (chunk.kind === 'conflict') return null;
  return chunk.kind === 'theirs' ? chunk.theirs : chunk.ours;
}
