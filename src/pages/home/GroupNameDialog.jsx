import { Alert, Input } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../components/ActionDialog.jsx';
import styles from './LinkRepositoryDialog.module.css';

/** Asks for a group's name. `onSave` receives it, and rejects if it could not be saved. */
export function GroupNameDialog({ title, okText, initialName = '', onSave, onClose }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState(null);

  const save = async () => {
    try {
      await onSave(name.trim());
      return true;
    } catch (saveError) {
      setError(saveError);
      return false;
    }
  };

  return (
    <ActionDialog
      title={title}
      okText={okText}
      canSubmit={Boolean(name.trim())}
      onSubmit={save}
      onClose={onClose}
    >
      <Input
        autoFocus
        aria-label="Group name"
        placeholder="Group name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      {error && <Alert className={styles.error} type="error" showIcon title={error.message} />}
    </ActionDialog>
  );
}
