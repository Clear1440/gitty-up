/** Reading keyboard and mouse events the same way on every platform. */
export class KeyboardHelper {
  /** Whether Ctrl, or Cmd on a Mac, is held: the key app shortcuts go with. */
  static hasCommandKey(event) {
    return Boolean(event.ctrlKey || event.metaKey);
  }

  /** Ctrl+Enter or Cmd+Enter, which submits even from a field where Enter adds a line. */
  static isSubmitShortcut(event) {
    return event.key === 'Enter' && KeyboardHelper.hasCommandKey(event);
  }
}
