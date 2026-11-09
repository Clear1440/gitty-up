import { FileTextOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useRef, useState } from 'react';
import { PATCH_EXTENSIONS, PatchHelper } from './patches.js';
import { useRepositoryContext } from './RepositoryContext.js';
import { usePatchActions } from './usePatchActions.js';
import styles from './PatchDropZone.module.css';

const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

/** Lets a .patch or .diff file be dropped anywhere on the repository, to apply it. */
export function PatchDropZone({ children }) {
  const { repository } = useRepositoryContext();
  const { openPatchFile } = usePatchActions();
  const { message } = App.useApp();
  const [dragging, setDragging] = useState(false);
  // Entering a child fires enter on it before leave on its parent, so count the levels.
  const depth = useRef(0);

  // A patch belongs to one repository, so a mono repo takes none.
  if (repository.isMono) return children;

  const onDragEnter = (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  };

  const onDragOver = (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const onDragLeave = (event) => {
    if (!hasFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };

  const onDrop = (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth.current = 0;
    setDragging(false);

    const files = Array.from(event.dataTransfer.files);
    const file = files.find(PatchHelper.isPatchFile);
    if (!file) {
      message.error(`Drop a ${PATCH_EXTENSIONS.join(' or ')} file to apply it`);
      return;
    }
    if (files.length > 1) message.info(`Applying ${file.name}. Drop patches one at a time.`);
    openPatchFile(file);
  };

  return (
    <div
      className={styles.zone}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}
      {dragging && (
        <div className={styles.overlay} aria-hidden>
          <div className={styles.prompt}>
            <FileTextOutlined className={styles.icon} />
            <p>Drop a patch to apply it to {repository.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}
