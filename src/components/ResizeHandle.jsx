import clsx from 'clsx';
import styles from './ResizeHandle.module.css';

/**
 * A draggable edge. Spread `handleFor()` from useResizableSizes onto it, and render
 * it as a child of the element it resizes, which must be positioned.
 */
export function ResizeHandle({ label, edge, size, min, max, className, ...handlers }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      className={clsx(styles.handle, styles[edge], className)}
      {...handlers}
    />
  );
}
