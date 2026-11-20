import { useRef } from 'react';
import { ResizeHandle } from '../../../components/ResizeHandle.jsx';
import { useResizableSizes } from '../../../components/useResizableSizes.js';
import { KeyboardHelper } from '../../../utils/KeyboardHelper.js';
import styles from './CommitPane.module.css';

const LIMITS = { files: { min: 64, max: 1600 } };

/**
 * Arrow Up and Down open the file before or after the one shown, from anywhere in the
 * list or the diff, the way a click on it would.
 */
function stepThroughFiles(event, filesArea) {
  const step = KeyboardHelper.listStep(event);
  if (step === 0 || event.defaultPrevented || KeyboardHelper.isTyping(event)) return;
  // A menu or picker open from here takes its own arrows.
  if (event.target.closest?.('[role="menu"], [role="listbox"]')) return;

  const rows = [...filesArea.querySelectorAll('[data-file-row]')];
  if (rows.length === 0) return;
  const shown = rows.filter((row) => row.getAttribute('aria-pressed') === 'true');
  // With several files picked, the step is from the one last clicked, which has focus.
  const current = shown.includes(document.activeElement) ? document.activeElement : shown[0];
  const index = rows.indexOf(current);
  const next = rows[index === -1 ? 0 : Math.min(Math.max(index + step, 0), rows.length - 1)];

  event.preventDefault();
  event.stopPropagation();
  if (next === current) return;
  next.click();
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: 'nearest' });
}

/**
 * A pane's file list above its diff, with a draggable edge between them. Every pane
 * shares the one height, so the list stays put when moving between commits.
 */
export function FilesAndDiff({ files, children }) {
  const splitRef = useRef(null);
  const filesRef = useRef(null);
  const { style, handleFor } = useResizableSizes(splitRef, 'diff-pane', LIMITS);

  return (
    <div
      ref={splitRef}
      className={styles.split}
      style={style}
      // Takes focus from clicks in the diff, so arrow keys still step through the files.
      tabIndex={-1}
      onKeyDown={(event) => stepThroughFiles(event, filesRef.current)}
    >
      {/* The edge sits outside the scrolling list, or it would scroll away with the files. */}
      <div ref={filesRef} className={styles.filesArea}>
        <div className={styles.files}>{files}</div>
        <ResizeHandle label="Resize file list" {...handleFor('files', 'bottom')} />
      </div>
      {children}
    </div>
  );
}
