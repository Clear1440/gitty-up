import { BranchesOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { Alert, Input, Segmented } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../components/ActionDialog.jsx';
import { useAddRepositoryStub, useLinkRepository } from '../../queries/repositories.js';
import { FolderPicker, useFolderPicker } from './FolderPicker.jsx';
import styles from './LinkRepositoryDialog.module.css';
import { useOpenAfter } from './useOpenAfter.js';

const SOURCES = [
  { value: 'filesystem', label: 'File system', icon: <FolderOpenOutlined /> },
  { value: 'git', label: 'Git', icon: <BranchesOutlined /> },
];

export function LinkRepositoryDialog({ onClose }) {
  const [source, setSource] = useState('filesystem');
  const [url, setUrl] = useState('');
  const picker = useFolderPicker();
  const link = useLinkRepository();
  const addStub = useAddRepositoryStub();
  const linkAndOpen = useOpenAfter(link);

  const fromGit = source === 'git';

  // A stub has nothing to open yet, so the dialog returns to its row on the list.
  const submitUrl = async () => {
    try {
      await addStub.mutateAsync(url.trim());
      return true;
    } catch {
      return false;
    }
  };

  const error = fromGit ? addStub.error : (link.error ?? picker.error);

  return (
    <ActionDialog
      title="Link a repository"
      okText={fromGit ? 'Add repository' : 'Link repository'}
      canSubmit={Boolean(fromGit ? url.trim() : picker.selected)}
      onSubmit={fromGit ? submitUrl : () => linkAndOpen(picker.selected)}
      onClose={onClose}
    >
      <Segmented
        block
        className={styles.source}
        options={SOURCES}
        value={source}
        onChange={setSource}
      />
      {fromGit ? (
        <>
          <p className={styles.hint}>
            Paste the repository’s URL. It gets a row where you can clone it, or locate a copy
            you already have.
          </p>
          <Input
            autoFocus
            aria-label="Repository URL"
            placeholder="https://github.com/owner/repository.git"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              addStub.reset();
            }}
          />
        </>
      ) : (
        <>
          <p className={styles.hint}>
            Choose a folder on this machine, or paste its path. Nothing is copied or moved.
          </p>
          <FolderPicker picker={picker} onChange={link.reset} />
        </>
      )}
      {error && <Alert className={styles.error} type="error" showIcon title={error.message} />}
    </ActionDialog>
  );
}
