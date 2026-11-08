/** Reading URLs that may not be valid, such as ones taken from request headers. */
export class UrlHelper {
  /** Parses a URL, or returns null when it is not one. */
  static tryParse(value) {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }
}
