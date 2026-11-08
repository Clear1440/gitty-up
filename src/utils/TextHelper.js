/**
 * Wording for text shown to the user. The server has its own copy in
 * server/utils/TextHelper.js, as the two are built and shipped separately.
 */
export class TextHelper {
  /** The singular or plural of a word, to go with `count`. */
  static pluralize(count, singular, plural = `${singular}s`) {
    return count === 1 ? singular : plural;
  }

  /** A count with its word, as in "1 file" or "3 files". */
  static countOf(count, singular, plural) {
    return `${count} ${TextHelper.pluralize(count, singular, plural)}`;
  }

  /** Whether `text` contains what was typed in a search box, ignoring case and outer spaces. */
  static includesIgnoringCase(text, query) {
    return text.toLowerCase().includes(query.trim().toLowerCase());
  }
}
