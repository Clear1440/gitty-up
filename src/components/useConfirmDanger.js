import { App } from 'antd';
import { useCallback } from 'react';

/**
 * Asks before something that can't be taken back, such as deleting or discarding.
 * The OK button is red, and the cursor starts on Cancel, so a stray Enter is harmless.
 * Takes what `modal.confirm` does, and anything given wins over these defaults.
 */
export function useConfirmDanger() {
  const { modal } = App.useApp();

  return useCallback(
    (options) =>
      modal.confirm({
        focusable: { autoFocusButton: 'cancel' },
        ...options,
        okButtonProps: { danger: true, ...options.okButtonProps },
      }),
    [modal],
  );
}
