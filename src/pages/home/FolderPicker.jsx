import { ArrowUpOutlined } from '@ant-design/icons';
import { Button, Input, Select, Space } from 'antd';
import { useState } from 'react';
import { useDirectories } from '../../queries/repositories.js';
import { FolderList } from './FolderList.jsx';
import styles from './LinkRepositoryDialog.module.css';

/** "Copy as path" on Windows wraps the path in quotes. */
const cleanPath = (path) => path.trim().replace(/^"(.*)"$/, '$1');

function findRoot({ roots, path }) {
  return roots.find((root) => path.toLowerCase().startsWith(root.toLowerCase()));
}

/**
 * State for a FolderPicker. `selected` is the folder the user chose, empty until
 * they choose one. `listing` is what the list shows, which only follows the text
 * field once editing finishes, not on every keystroke.
 */
export function useFolderPicker() {
  const [folder, setFolder] = useState('');
  const [browsing, setBrowsing] = useState();
  const directories = useDirectories(browsing);

  return {
    folder,
    setFolder,
    setBrowsing,
    selected: cleanPath(folder),
    listing: directories.data,
    isLoading: directories.isPending,
    error: directories.error,
  };
}

/** `onChange` fires whenever the selection changes. */
export function FolderPicker({ picker, onChange }) {
  const { folder, setFolder, setBrowsing, selected, listing, isLoading } = picker;

  const goTo = (path) => {
    setFolder(path);
    setBrowsing(path);
    onChange();
  };

  return (
    <>
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
            onChange();
          }}
          onBlur={() => {
            if (selected) setBrowsing(selected);
          }}
        />
      </Space.Compact>
      <FolderList directories={listing?.directories} isLoading={isLoading} onOpen={goTo} />
    </>
  );
}
