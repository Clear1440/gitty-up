import { useRef } from 'react';
import { ResizeHandle } from '../../../components/ResizeHandle.jsx';
import { useResizableSizes } from '../../../components/useResizableSizes.js';
import styles from './CommitPane.module.css';

const LIMITS = { files: { min: 64, max: 1600 } };

/**
 * A pane's file list above its diff, with a draggable edge between them. Every pane
 * shares the one height, so the list stays put when moving between commits.
 */
export function FilesAndDiff({ files, children }) {
  const splitRef = useRef(null);
  const { style, handleFor } = useResizableSizes(splitRef, 'diff-pane', LIMITS);

  return (
    <div ref={splitRef} className={styles.split} style={style}>
      {/* The edge sits outside the scrolling list, or it would scroll away with the files. */}
      <div className={styles.filesArea}>
        <div className={styles.files}>{files}</div>
        <ResizeHandle label="Resize file list" {...handleFor('files', 'bottom')} />
      </div>
      {children}
    </div>
  );
}
