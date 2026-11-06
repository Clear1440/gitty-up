import { FolderFilled } from '@ant-design/icons';
import { Checkbox, Spin, Tag } from 'antd';
import clsx from 'clsx';
import styles from './LinkRepositoryDialog.module.css';

/** With `selection`, repositories get a checkbox, while clicking a row still opens it. */
export function FolderList({ directories, isLoading, onOpen, selection }) {
  if (isLoading) {
    return (
      <div className={styles.folderList}>
        <Spin className="centered" />
      </div>
    );
  }

  return (
    <div className={styles.folderList}>
      {directories?.length === 0 && <p className={styles.noFolders}>No folders here.</p>}
      {directories?.map((directory) => (
        <div key={directory.path} className={styles.folderEntry}>
          {selection && (
            <span className={styles.checkSlot}>
              {directory.isRepository && (
                <Checkbox
                  aria-label={`Select ${directory.name}`}
                  checked={selection.selected.has(directory.path)}
                  onChange={() => selection.onToggle(directory.path)}
                />
              )}
            </span>
          )}
          <button
            type="button"
            className={clsx(styles.folderRow, directory.isRepository && styles.repository)}
            onClick={() => onOpen(directory.path)}
          >
            <FolderFilled />
            <span className={styles.folderName}>{directory.name}</span>
            {directory.isRepository && <Tag className={styles.gitTag}>git</Tag>}
          </button>
        </div>
      ))}
    </div>
  );
}
