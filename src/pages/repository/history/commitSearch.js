/**
 * Whether a commit matches what was typed in the history's search box: its message,
 * author, email, branch or tag names, or the start of its hash. Case is ignored, and so
 * are spaces around the query. An empty query matches nothing.
 */
export function matchesCommit(commit, query) {
  const needle = query.trim().toLowerCase();
  if (!needle || commit.stash) return false;

  if (commit.hash?.toLowerCase().startsWith(needle)) return true;
  const fields = [
    commit.subject,
    commit.author,
    commit.email,
    commit.repository,
    ...(commit.refs ?? []).map((ref) => ref.name),
  ];
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

/** The hashes of the commits that match, in the order they are listed. */
export function findMatches(entries, query) {
  return entries.filter((entry) => matchesCommit(entry, query)).map((entry) => entry.hash);
}
