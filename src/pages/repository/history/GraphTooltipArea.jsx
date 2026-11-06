import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from '../HistoryPage.module.css';

const UNNAMED_BRANCH = 'Unknown branch';

/**
 * Names the branch under the pointer anywhere in the git tree. The tree is many small
 * SVGs, so one tooltip here listens for their `data-branch` hit areas, rather than
 * every line in every row having its own. It holds the state too, so that moving the
 * mouse never re-renders the rows it wraps.
 */
export function GraphTooltipArea({ children }) {
  const [tip, setTip] = useState(null);
  const isShowing = tip !== null;

  const handleMouseMove = (event) => {
    const target = event.target.closest('[data-branch]');
    setTip(
      target
        ? { text: target.dataset.branch || UNNAMED_BRANCH, x: event.clientX, y: event.clientY }
        : null,
    );
  };

  // Scrolling moves the tree out from under a pointer that sends no event of its own.
  useEffect(() => {
    if (!isShowing) return undefined;
    const hide = () => setTip(null);
    window.addEventListener('scroll', hide, { capture: true, once: true });
    return () => window.removeEventListener('scroll', hide, { capture: true });
  }, [isShowing]);

  return (
    <div
      className={styles.graphTooltipArea}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTip(null)}
    >
      {children}
      {tip &&
        createPortal(
          <div className={styles.graphTooltip} style={{ left: tip.x, top: tip.y }} role="tooltip">
            {tip.text}
          </div>,
          document.body,
        )}
    </div>
  );
}
