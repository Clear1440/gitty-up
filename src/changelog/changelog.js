/**
 * Reads CHANGELOG.md: a `## <version> - <date>` heading per release, or `## Unreleased`,
 * with `### Added`-style sections of `- ` items, and plain paragraphs as notes. Anything
 * before the first release heading is the file's own introduction, and is skipped.
 */

const RELEASE_HEADING = /^##\s+(.+?)\s*$/;
const SECTION_HEADING = /^###\s+(.+?)\s*$/;
const ITEM = /^[-*]\s+(.*)$/;
const VERSION_AND_DATE = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\s+[-–—]\s+(.+))?$/;

function parseHeading(text) {
  if (/^unreleased$/i.test(text)) return { version: null, date: null };
  const match = VERSION_AND_DATE.exec(text);
  return match ? { version: match[1], date: match[2] ?? null } : { version: text, date: null };
}

const hasContent = (release) =>
  release.notes.length > 0 || release.sections.some((section) => section.items.length > 0);

/** The releases in a changelog, newest first as written, leaving out any with nothing in them. */
export function parseChangelog(text) {
  const releases = [];
  let release = null;
  let section = null;
  // What the next indented or wrapped line continues: an item, a note, or nothing.
  let open = null;

  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    const heading = RELEASE_HEADING.exec(rawLine);
    if (heading && !rawLine.startsWith('###')) {
      release = { ...parseHeading(heading[1]), sections: [], notes: [] };
      releases.push(release);
      section = null;
      open = null;
      continue;
    }
    if (!release) continue;

    const sectionHeading = SECTION_HEADING.exec(rawLine);
    if (sectionHeading) {
      section = { title: sectionHeading[1], items: [] };
      release.sections.push(section);
      open = null;
      continue;
    }
    if (!line) {
      open = null;
      continue;
    }

    const item = ITEM.exec(line);
    if (item && !(open && rawLine.startsWith(' ') && !ITEM.test(rawLine))) {
      if (!section) {
        section = { title: null, items: [] };
        release.sections.push(section);
      }
      section.items.push(item[1]);
      open = { list: section.items };
    } else if (open) {
      open.list[open.list.length - 1] += ` ${line}`;
    } else {
      release.notes.push(line);
      open = { list: release.notes };
    }
  }

  return releases.filter(hasContent);
}

/** Compares two versions such as 0.2.10 and 0.2.9 by number: negative, zero or positive. */
export function compareVersions(a, b) {
  const parts = (version) => version.split('-')[0].split('.').map(Number);
  const [left, right] = [parts(a), parts(b)];
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * What is new to someone who last saw `lastSeen` and now runs `current`: the releases
 * after the one, up to and including the other.
 */
export function releasesSince(releases, lastSeen, current) {
  return releases.filter(
    ({ version }) =>
      version !== null &&
      compareVersions(version, lastSeen) > 0 &&
      compareVersions(version, current) <= 0,
  );
}

/**
 * The releases to show on starting a newer version than last time. A first start shows
 * nothing, as there is no "before" to compare with, and neither does going back a version.
 */
export function newReleasesSinceLastStart(lastSeen, current, releases) {
  if (!lastSeen || compareVersions(current, lastSeen) <= 0) return [];
  return releasesSince(releases, lastSeen, current);
}

/**
 * Splits text into plain runs and the little markdown a changelog item uses: **bold**,
 * `code` and [links](url). Each part is { type, text, href? }.
 */
export function parseInline(text) {
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ type: 'text', text: text.slice(last, match.index) });
    if (match[1] !== undefined) parts.push({ type: 'bold', text: match[1] });
    else if (match[2] !== undefined) parts.push({ type: 'code', text: match[2] });
    else parts.push({ type: 'link', text: match[3], href: match[4] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  return parts;
}
