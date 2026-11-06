import { FolderFilled } from '@ant-design/icons';
import { Spin, Tag } from 'antd';
import clsx from 'clsx';
import styles from './LinkRepositoryDialog.module.css';

export function FolderList({ directories, isLoading, onOpen }) {
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
        <button
          key={directory.path}
          type="button"
          className={clsx(styles.folderRow, directory.isRepository && styles.repository)}
          onClick={() => onOpen(directory.path)}
        >
          <FolderFilled />
          <span className={styles.folderName}>{directory.name}</span>
          {directory.isRepository && <Tag className={styles.gitTag}>git</Tag>}
        </button>
      ))}
    </div>
  );
}
