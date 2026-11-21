/** Links to web pages outside the app. */
export class LinkHelper {
  /**
   * Opens a web page in a new browser tab. The desktop app catches this and hands the
   * page to the default browser, as it does for links with target="_blank".
   */
  static openExternal(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
