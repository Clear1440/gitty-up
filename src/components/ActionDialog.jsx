import { Modal } from 'antd';
import { useState } from 'react';

/**
 * A modal that runs one action. `onSubmit` resolves true when the dialog should
 * close, and the dialog stays open on failure so nothing typed is lost.
 * Mount it to open it. `onClose` fires after the closing animation.
 */
export function ActionDialog({
  title,
  okText,
  danger = false,
  canSubmit = true,
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
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit();
  };

  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      okButtonProps={{ danger, disabled: !canSubmit }}
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
