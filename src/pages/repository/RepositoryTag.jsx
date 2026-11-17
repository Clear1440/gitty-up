import clsx from 'clsx';
import { colorOfSlot, mapRepositoryColors } from './monoColors.js';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './RepositoryTag.module.css';

/** A repository's color in the open mono repo, or null outside one. */
export function useRepositoryColor(name) {
  const { status } = useRepositoryContext();
  return mapRepositoryColors(status?.mono).get(name) ?? null;
}

/**
 * Names the repository something in a mono repo belongs to, in that repository's own
 * color, which it keeps everywhere in the tab. `slot` sets the color directly, for lists
 * of repositories that already know theirs.
 */
export function RepositoryTag({ name, slot, className, children }) {
  const fromName = useRepositoryColor(name);
  const color = slot === undefined ? fromName : colorOfSlot(slot);
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

/** Just the dot, for where the name is already written next to it. */
export function RepositoryDot({ slot }) {
  return (
    <span
      className={styles.dot}
      style={{ '--repository-color': colorOfSlot(slot) }}
      aria-hidden
    />
  );
}
