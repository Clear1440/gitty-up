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

  /** Whether a key press is meant for a field being typed in, rather than for the page. */
  static isTyping(event) {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
  }

  /**
   * -1 for Arrow Up and 1 for Arrow Down, pressed alone, or 0 for anything else. These
   * step through lists of files and commits.
   */
  static listStep(event) {
    if (event.altKey || event.shiftKey || KeyboardHelper.hasCommandKey(event)) return 0;
    if (event.key === 'ArrowUp') return -1;
    if (event.key === 'ArrowDown') return 1;
    return 0;
  }
}
