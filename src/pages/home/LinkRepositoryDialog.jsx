import { ArrowUpOutlined } from '@ant-design/icons';
import { Alert, Button, Input, Select, Space } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ActionDialog } from '../../components/ActionDialog.jsx';
import { paths } from '../../paths.js';
import { useDirectories, useLinkRepository } from '../../queries/repositories.js';
import { FolderList } from './FolderList.jsx';
import styles from './LinkRepositoryDialog.module.css';

/** "Copy as path" on Windows wraps the path in quotes. */
const cleanPath = (path) => path.trim().replace(/^"(.*)"$/, '$1');

function findRoot({ roots, path }) {
  return roots.find((root) => path.toLowerCase().startsWith(root.toLowerCase()));
}

export function LinkRepositoryDialog({ onClose }) {
  const navigate = useNavigate();
  const link = useLinkRepository();
  // `folder` is what gets linked. `browsing` is what the list shows, which only
  // follows the text field once editing finishes, not on every keystroke.
  const [folder, setFolder] = useState('');
  const [browsing, setBrowsing] = useState();
  const directories = useDirectories(browsing);
  const listing = directories.data;

  const goTo = (path) => {
    setFolder(path);
    setBrowsing(path);
    link.reset();
  };

  const handleSubmit = async () => {
    try {
      const repository = await link.mutateAsync(cleanPath(folder));
      navigate(paths.repository(repository.id));
      return true;
    } catch {
      return false;
    }
  };

  const error = link.error ?? directories.error;

  return (
    <ActionDialog
      title="Link a repository"
      okText="Link repository"
      canSubmit={Boolean(cleanPath(folder))}
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      <p className={styles.hint}>
        Choose a folder on this machine, or paste its path. Nothing is copied or moved.
      </p>
      <Space.Compact block>
        <Select
          aria-label="Drive"
          className={styles.driveSelect}
          value={listing && findRoot(listing)}
          options={listing?.roots.map((root) => ({ label: root, value: root }))}
          onChange={goTo}
        />
        <Button
          aria-label="Parent folder"
          icon={<ArrowUpOutlined />}
          disabled={!listing?.parent}
          onClick={() => goTo(listing.parent)}
        />
        <Input
          autoFocus
          aria-label="Folder path"
          placeholder={listing?.path}
          value={folder}
          onChange={(event) => {
            setFolder(event.target.value);
            link.reset();
          }}
          onBlur={() => {
            if (cleanPath(folder)) setBrowsing(cleanPath(folder));
          }}
        />
      </Space.Compact>
      <FolderList
        directories={listing?.directories}
        isLoading={directories.isPending}
        onOpen={goTo}
      />
      {error && <Alert type="error" showIcon title={error.message} />}
    </ActionDialog>
  );
}
