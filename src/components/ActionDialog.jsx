import { Modal } from 'antd';
import { useState } from 'react';
import { KeyboardHelper } from '../utils/KeyboardHelper.js';

/** Ant Design's own width, as the least a wide dialog takes. */
const WIDE_WIDTH = 'max(520px, 50vw)';

/**
 * A modal that runs one action. `onSubmit` resolves true when the dialog should
 * close, and the dialog stays open on failure so nothing typed is lost.
 * Mount it to open it. `onClose` fires after the closing animation. `wide` makes room
 * for long branch names: half the window, and never narrower than usual.
 */
export function ActionDialog({
  title,
  okText,
  danger = false,
  canSubmit = true,
  wide = false,
  onSubmit,
  onClose,
  children,
}) {
  const [open, setOpen] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const finished = await onSubmit();
    setSubmitting(false);
    if (finished) setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (KeyboardHelper.isSubmitShortcut(event)) submit();
  };

  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      okButtonProps={{ danger, disabled: !canSubmit }}
      width={wide ? WIDE_WIDTH : undefined}
      confirmLoading={submitting}
      onOk={submit}
      onCancel={() => setOpen(false)}
      afterClose={onClose}
      destroyOnHidden
    >
      <form
        onKeyDown={handleKeyDown}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {children}
        {/* Lets Enter submit from a single-line field. */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
