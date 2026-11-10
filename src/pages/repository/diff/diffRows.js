const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

const KINDS = { ' ': 'context', '+': 'added', '-': 'deleted' };

/**
 * Parses a one-file unified diff into hunks. A line's `id` is its index in the diff,
 * which is how the server identifies lines to stage.
 *
 * Returns no hunks for anything else, such as a binary file or a conflict's
 * combined diff, which have no lines that can be staged.
 */
export function parseDiff(diff) {
  const hunks = [];
  let oldNumber = 0;
  let newNumber = 0;

  diff.split('\n').forEach((raw, id) => {
    const header = raw.match(HUNK_HEADER);
    if (header) {
      oldNumber = Number(header[1]);
      newNumber = Number(header[2]);
      hunks.push({ id, header: raw, lines: [] });
      return;
    }

    const hunk = hunks.at(-1);
    if (!hunk) return;
    if (raw.startsWith('\\')) {
      hunk.lines.at(-1).noNewline = true;
      return;
    }

    const kind = KINDS[raw[0]];
    if (!kind) return;
    hunk.lines.push({
      id,
      kind,
      text: raw.slice(1),
      oldNumber: kind === 'added' ? null : oldNumber,
      newNumber: kind === 'deleted' ? null : newNumber,
    });
    if (kind !== 'added') oldNumber += 1;
    if (kind !== 'deleted') newNumber += 1;
  });

  return hunks;
}

const isChange = (line) => line.kind !== 'context';
const changeIds = (lines) => lines.filter(isChange).map((line) => line.id);

/** Every line that can be selected, top to bottom. */
export const selectableIds = (hunks) => hunks.flatMap((hunk) => changeIds(hunk.lines));

/** Splits lines into runs that are all context or all changes. */
function toRuns(lines) {
  const runs = [];
  for (const line of lines) {
    const run = runs.at(-1);
    if (run?.changed === isChange(line)) run.lines.push(line);
    else runs.push({ changed: isChange(line), lines: [line] });
  }
  return runs;
}

const hunkRow = (id, text, lines) => ({ type: 'hunk', key: `hunk-${id}`, text, ids: changeIds(lines) });
const lineRow = (line) => ({ type: 'line', key: line.id, line });
const pairRow = (left, right) => ({ type: 'pair', key: left?.id ?? right.id, left, right });

/** Lines each deletion up with an addition, as the two versions of the same text. */
function pairChanges(lines) {
  const deleted = lines.filter((line) => line.kind === 'deleted');
  const added = lines.filter((line) => line.kind === 'added');
  return Array.from({ length: Math.max(deleted.length, added.length) }, (_, index) =>
    pairRow(deleted[index] ?? null, added[index] ?? null),
  );
}

/** The views older versions stored as one word, as the two choices they stood for. */
const LEGACY_VIEWS = {
  hunk: { context: 'hunk', layout: 'inline' },
  inline: { context: 'full', layout: 'inline' },
  split: { context: 'full', layout: 'split' },
};

/**
 * A diff view: `context` is "hunk" (just the changes, with a few lines around them) or
 * "full" (the whole file), and `layout` is "inline" or "split" (old and new side by side).
 * Also takes the single words older versions stored.
 */
export function toDiffView(view) {
  if (typeof view === 'string') return LEGACY_VIEWS[view] ?? LEGACY_VIEWS.hunk;
  return {
    context: view?.context === 'full' ? 'full' : 'hunk',
    layout: view?.layout === 'split' ? 'split' : 'inline',
  };
}

function bodyRows(lines, changed, layout) {
  if (layout !== 'split') return lines.map(lineRow);
  return changed ? pairChanges(lines) : lines.map((line) => pairRow(line, line));
}

/**
 * Turns hunks into the rows of a view. With hunk context each of git's hunks is headed
 * by its header. A whole-file diff is a single hunk, so there each run of changes is
 * treated as a hunk of its own, headed by a row with no text that holds its action.
 */
export function buildRows(hunks, view) {
  const { context, layout } = toDiffView(view);

  if (context === 'hunk') {
    return hunks.flatMap(({ id, header, lines }) => [
      hunkRow(id, header, lines),
      ...toRuns(lines).flatMap(({ changed, lines: run }) => bodyRows(run, changed, layout)),
    ]);
  }

  return hunks.flatMap((hunk) =>
    toRuns(hunk.lines).flatMap(({ changed, lines }) => {
      const body = bodyRows(lines, changed, layout);
      return changed ? [hunkRow(lines[0].id, '', lines), ...body] : body;
    }),
  );
}
