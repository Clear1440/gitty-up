import { Button } from 'antd';
import clsx from 'clsx';
import { memo } from 'react';
import styles from '../DiffView.module.css';

const SIGNS = { context: ' ', added: '+', deleted: '-' };

function LineText({ line }) {
  return (
    <span className={styles.code}>
      {line.text || ' '}
      {line.noNewline && <span className={styles.noNewline}> no newline at end of file</span>}
    </span>
  );
}

/**
 * The box that selects a changed line. Context lines keep the space, so columns align.
 * A read-only diff has no `onToggle`, and no space for the boxes.
 */
function SelectCell({ line, selected, onToggle }) {
  if (!onToggle) return null;
  if (line.kind === 'context') return <span className={styles.select} />;
  const number = line.newNumber ?? line.oldNumber;
  return (
    <button
      type="button"
      className={clsx(styles.select, styles.selectButton)}
      aria-pressed={selected}
      aria-label={`Select ${line.kind} line ${number}`}
      title="Select this line. Shift-click selects a range."
      onClick={(event) => onToggle(line.id, event.shiftKey)}
    />
  );
}

export const HunkRow = memo(function HunkRow({ text, ids, label, disabled, onApply }) {
  return (
    <div className={clsx(styles.row, styles.hunk)}>
      <span className={styles.hunkText}>{text}</span>
      {onApply && (
        <Button size="small" disabled={disabled} onClick={() => onApply(ids)}>
          {label}
        </Button>
      )}
    </div>
  );
});

export const LineRow = memo(function LineRow({ line, selected, onToggle }) {
  return (
    <div className={clsx(styles.row, styles[line.kind], selected && styles.selected)}>
      <SelectCell line={line} selected={selected} onToggle={onToggle} />
      <span className={styles.number}>{line.oldNumber}</span>
      <span className={styles.number}>{line.newNumber}</span>
      <span className={styles.sign}>{SIGNS[line.kind]}</span>
      <LineText line={line} />
    </div>
  );
});

function SplitSide({ line, number, selected, onToggle }) {
  if (!line) return <div className={clsx(styles.side, styles.emptySide)} />;
  return (
    <div className={clsx(styles.side, styles[line.kind], selected && styles.selected)}>
      <SelectCell line={line} selected={selected} onToggle={onToggle} />
      <span className={styles.number}>{number}</span>
      <LineText line={line} />
    </div>
  );
}

export const PairRow = memo(function PairRow({
  left,
  right,
  leftSelected,
  rightSelected,
  onToggle,
}) {
  return (
    <div className={styles.pair}>
      <SplitSide
        line={left}
        number={left?.oldNumber}
        selected={leftSelected}
        onToggle={onToggle}
      />
      <SplitSide
        line={right}
        number={right?.newNumber}
        selected={rightSelected}
        onToggle={onToggle}
      />
    </div>
  );
});
