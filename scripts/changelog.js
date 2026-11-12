/**
 * Keeps CHANGELOG.md in step with releases. Notes gather under `## Unreleased` as work
 * lands, and a release moves them under a heading of their own, leaving Unreleased empty
 * for what comes next.
 */

const UNRELEASED = /^##[ \t]+Unreleased[ \t]*$/im;
const NEXT_RELEASE = /^##[ \t]+/m;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether the changelog has a section for `version`. */
export function hasRelease(text, version) {
  return new RegExp(`^##[ \\t]+v?${escape(version)}\\b`, 'm').test(text);
}

/**
 * Moves what is under Unreleased into a new `## <version> - <date>` section. `stamped` is
 * false, and the text unchanged, when Unreleased is missing or empty.
 */
export function stampUnreleased(text, version, date) {
  const heading = UNRELEASED.exec(text);
  if (!heading) return { text, stamped: false };

  const start = heading.index + heading[0].length;
  const rest = text.slice(start);
  const next = NEXT_RELEASE.exec(rest);
  const notes = next ? rest.slice(0, next.index) : rest;
  if (!notes.trim()) return { text, stamped: false };

  const stampedText = `${text.slice(0, start)}\n\n## ${version} - ${date}\n\n${notes.trim()}\n${
    next ? `\n${rest.slice(next.index)}` : ''
  }`;
  return { text: stampedText, stamped: true };
}
