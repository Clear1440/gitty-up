import { Alert } from 'antd';
import { ActionDialog } from '../../components/ActionDialog.jsx';
import { useCloneRepository, useLocateRepository } from '../../queries/repositories.js';
import { FolderPicker, useFolderPicker } from './FolderPicker.jsx';
import styles from './LinkRepositoryDialog.module.css';
import { useOpenAfter } from './useOpenAfter.js';

function joinPath(folder, name) {
  const separator = folder.includes('\\') ? '\\' : '/';
  return `${folder.replace(/[\\/]+$/, '')}${separator}${name}`;
}

export function CloneRepositoryDialog({ repository, onClose }) {
  const picker = useFolderPicker();
  const clone = useCloneRepository(repository.id);
  const cloneAndOpen = useOpenAfter(clone);

  // The folder on show is a fair target, so it needs no separate selection.
  const parentPath = picker.selected || picker.listing?.path;
  const error = clone.error ?? picker.error;

  return (
    <ActionDialog
      title={`Clone ${repository.name}`}
      okText="Clone repository"
      canSubmit={Boolean(parentPath)}
      onSubmit={() => cloneAndOpen(parentPath)}
      onClose={onClose}
    >
      <p className={styles.hint}>Choose the folder to clone into.</p>
      <FolderPicker picker={picker} onChange={clone.reset} />
      {parentPath && (
        <p className={styles.target}>
          Clones to <code>{joinPath(parentPath, repository.name)}</code>
        </p>
      )}
      {error && <Alert className={styles.error} type="error" showIcon title={error.message} />}
    </ActionDialog>
  );
}

export function LocateRepositoryDialog({ repository, onClose }) {
  const picker = useFolderPicker();
  const locate = useLocateRepository(repository.id);
  const locateAndOpen = useOpenAfter(locate);

  const error = locate.error ?? picker.error;

  return (
    <ActionDialog
      title={`Locate ${repository.name}`}
      okText="Link repository"
      canSubmit={Boolean(picker.selected)}
      onSubmit={() => locateAndOpen(picker.selected)}
      onClose={onClose}
    >
      <p className={styles.hint}>
        Choose the folder that already holds this repository. Nothing is copied or moved.
      </p>
      <FolderPicker picker={picker} onChange={locate.reset} />
      {error && <Alert className={styles.error} type="error" showIcon title={error.message} />}
    </ActionDialog>
  );
}
