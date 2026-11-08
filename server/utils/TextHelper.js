/**
 * Wording for messages shown to the user. The client has its own copy in
 * src/utils/TextHelper.js, as the two are built and shipped separately.
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

  /** Joins names as a sentence would: "a", "a and b", or "a, b and c". */
  static joinWithAnd(names) {
    if (names.length < 2) return names.join('');
    return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  }
}
