/**
 * Turns text into a tidier branch name as it is typed. Spaces become dashes, dashes
 * never double up, and leading spaces go, since a name can't start with a dash.
 */
export function formatBranchName(text) {
  return text
    .replace(/^\s+/, '')
    .replace(/\s/g, '-')
    .replace(/-{2,}/g, '-');
}
