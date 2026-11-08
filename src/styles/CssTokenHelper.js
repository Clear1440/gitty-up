/** Reads values from tokens.css, for code that cannot use CSS directly. */
export class CssTokenHelper {
  /** A custom property's value, such as read('--color-primary'). */
  static read(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /** A custom property given in pixels, as a number. */
  static readPixels(name) {
    return Number.parseInt(CssTokenHelper.read(name), 10);
  }
}
