import clsx from 'clsx';
import styles from './FileSection.module.css';

const STATUS_BADGES = {
  added: { letter: 'A', className: styles.added },
  untracked: { letter: 'U', className: styles.added },
  modified: { letter: 'M', className: styles.modified },
  typechange: { letter: 'T', className: styles.modified },
  deleted: { letter: 'D', className: styles.deleted },
  renamed: { letter: 'R', className: styles.renamed },
  copied: { letter: 'C', className: styles.renamed },
  conflicted: { letter: '!', className: styles.deleted },
};

function splitPath(path) {
  const index = path.lastIndexOf('/') + 1;
  return { directory: path.slice(0, index), name: path.slice(index) };
}

function FileRow({ file, selected, onSelect, actions }) {
  const badge = STATUS_BADGES[file.status];
  const { directory, name } = splitPath(file.path);

  return (
    <li className={clsx(styles.row, selected && styles.selected)}>
      <button
        type="button"
        className={styles.button}
        title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}
        onClick={() => onSelect(file)}
      >
        <span className={clsx(styles.badge, badge.className)} title={file.status}>
          {badge.letter}
        </span>
        <span className={styles.path}>
          <span className={styles.directory}>{directory}</span>
          {name}
        </span>
      </button>
      <span className={styles.actions}>{actions}</span>
    </li>
  );
}

export function FileSection({ title, files, headerAction, isSelected, onSelect, renderActions }) {
  if (files.length === 0) return null;
  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h3>
          {title} ({files.length})
        </h3>
        {headerAction}
      </header>
      <ul className={styles.list}>
        {files.map((file) => (
          <FileRow
            key={file.path}
            file={file}
            selected={isSelected(file)}
            onSelect={onSelect}
            actions={renderActions(file)}
          />
        ))}
      </ul>
    </section>
  );
}
