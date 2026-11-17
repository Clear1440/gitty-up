import clsx from 'clsx';
import { mapRepositoryColors } from './monoColors.js';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './RepositoryTag.module.css';

/** A repository's color in the open mono repo, or null outside one. */
export function useRepositoryColor(name) {
  const { status } = useRepositoryContext();
  return mapRepositoryColors(status?.mono).get(name) ?? null;
}

/**
 * Names the repository a commit in a mono repo belongs to, in that repository's own
 * color, which it keeps everywhere in the history.
 */
export function RepositoryTag({ name, className, children }) {
  const color = useRepositoryColor(name);
  return (
    <span
      className={clsx(styles.tag, className)}
      style={color ? { '--repository-color': color } : undefined}
    >
      <span className={styles.dot} aria-hidden />
      {children ?? name}
    </span>
  );
}
