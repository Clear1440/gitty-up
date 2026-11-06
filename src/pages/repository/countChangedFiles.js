/** How many files have uncommitted changes. One both staged and unstaged counts once. */
export function countChangedFiles({ staged, unstaged, conflicted }) {
  return new Set([...staged, ...unstaged, ...conflicted].map((file) => file.path)).size;
}
