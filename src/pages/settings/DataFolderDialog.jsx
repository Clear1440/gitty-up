import { Alert } from 'antd';
import { ActionDialog } from '../../components/ActionDialog.jsx';
import { useSetDataDir } from '../../queries/settings.js';
import { FolderPicker, useFolderPicker } from '../home/FolderPicker.jsx';
import styles from '../home/LinkRepositoryDialog.module.css';

/** What happened to the data, for the message shown after a move. */
export const MOVE_OUTCOMES = {
  copied: 'Your repositories and groups were copied there. The old copy was left in place.',
  existing: 'That folder already had gitty-up data, so it is in use now.',
  fresh: 'There was nothing to copy, so it starts empty.',
  unchanged: 'That is already the data folder.',
};

export function DataFolderDialog({ onMoved, onClose }) {
  const picker = useFolderPicker();
  const setDataDir = useSetDataDir();

  const submit = async () => {
    try {
      onMoved(await setDataDir.mutateAsync(picker.selected));
      return true;
    } catch {
      return false;
    }
  };

  // The picker's own error is left out: it fails to list a folder that doesn't exist
  // yet, which is fine here, as moving the data creates it.
  const { error } = setDataDir;

  return (
    <ActionDialog
      title="Choose a data folder"
      okText="Use this folder"
      canSubmit={Boolean(picker.selected)}
      onSubmit={submit}
      onClose={onClose}
    >
      <p className={styles.hint}>
        If the folder already holds gitty-up data, that data is used. Otherwise your current
        repositories and groups are copied into it. A folder that doesn’t exist yet is created.
      </p>
      <FolderPicker picker={picker} onChange={setDataDir.reset} />
      {error && <Alert className={styles.error} type="error" showIcon title={error.message} />}
    </ActionDialog>
  );
}
