import { App } from 'antd';
import { useCallback } from 'react';

/**
 * Copies text to the clipboard and says how it went. `copy(text, what)` reports
 * "Copied <what>", which is the text itself unless named otherwise.
 */
export function useCopyToClipboard() {
  const { message } = App.useApp();

  return useCallback(
    async (text, what = text) => {
      try {
        await navigator.clipboard.writeText(text);
        message.success(`Copied ${what}`);
      } catch {
        message.error('Could not reach the clipboard');
      }
    },
    [message],
  );
}
