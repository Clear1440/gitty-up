/** The entries to show: only the calls that could change a repository, unless `everything`. */
export function visibleEntries(entries, everything) {
  return everything ? entries : entries.filter((entry) => entry.write);
}

/** An argument's value as one short line. */
function formatValue(value) {
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** The arguments the tool was given, as label and value pairs, leaving out the repository. */
export function argumentRows(args = {}) {
  return Object.entries(args)
    .filter(([key]) => key !== 'repository')
    .map(([key, value]) => ({ key, value: formatValue(value) }));
}

const shortHash = (hash) => hash?.slice(0, 7) ?? 'no commits';

/** Where HEAD stood, as in "main at 1a2b3c4", or "detached at 1a2b3c4". */
export function describeHead(head) {
  if (!head) return null;
  return `${head.branch ?? 'detached'} at ${shortHash(head.head)}`;
}

/** The outcome as a short word: Done, Failed or Undone. */
export function outcomeLabel(entry) {
  if (entry.undone) return 'Undone';
  return entry.outcome === 'ok' ? 'Done' : 'Failed';
}
