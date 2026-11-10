import { Button } from 'antd';
import clsx from 'clsx';
import { memo } from 'react';
import styles from '../DiffView.module.css';

const SIGNS = { context: ' ', added: '+', deleted: '-' };

function LineText({ line }) {
  return (
    <span className={styles.code}>
      {line.segments
        ? line.segments.map((segment, index) => (
            <span key={index} className={segment.changed ? styles.wordChanged : undefined}>
              {segment.text}
            </span>
          ))
        : line.text || ' '}
      {line.noNewline && <span className={styles.noNewline}> no newline at end of file</span>}
    </span>
  );
}

/**
 * What a click on a changed line does: a plain click stages (or unstages) just that line,
 * and shift or ctrl/cmd picks it out, to stage several at once. A click that ends a
 * text selection is left alone, so code can still be copied from the diff.
 */
function lineClickProps(line, { onToggle, onStage, stageLabel }) {
  if (!onStage || line.kind === 'context') return {};

  const handleClick = (event) => {
    if (window.getSelection()?.toString()) return;
    if (event.shiftKey || event.ctrlKey || event.metaKey) onToggle(line.id, event.shiftKey);
    else onStage(line.id);
  };

  return {
    role: 'button',
    tabIndex: 0,
    title: `Click to ${stageLabel.toLowerCase()} this line. Shift- or Ctrl-click to pick several.`,
    'aria-label': `${stageLabel} ${line.kind} line ${line.newNumber ?? line.oldNumber}`,
    onClick: handleClick,
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleClick(event);
      }
    },
  };
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

export const LineRow = memo(function LineRow({ line, selected, actions }) {
  const clickProps = lineClickProps(line, actions);
  return (
    <div
      className={clsx(
        styles.row,
        styles[line.kind],
        selected && styles.selected,
        clickProps.onClick && styles.stageable,
      )}
      {...clickProps}
    >
      <span className={styles.number}>{line.oldNumber}</span>
      <span className={styles.number}>{line.newNumber}</span>
      <span className={styles.sign}>{SIGNS[line.kind]}</span>
      <LineText line={line} />
    </div>
  );
});

function SplitSide({ line, number, selected, actions }) {
  if (!line) return <div className={clsx(styles.side, styles.emptySide)} />;
  const clickProps = lineClickProps(line, actions);
  return (
    <div
      className={clsx(
        styles.side,
        styles[line.kind],
        selected && styles.selected,
        clickProps.onClick && styles.stageable,
      )}
      {...clickProps}
    >
      <span className={styles.number}>{number}</span>
      <LineText line={line} />
    </div>
  );
}

export const PairRow = memo(function PairRow({ left, right, leftSelected, rightSelected, actions }) {
  return (
    <div className={styles.pair}>
      <SplitSide line={left} number={left?.oldNumber} selected={leftSelected} actions={actions} />
      <SplitSide
        line={right}
        number={right?.newNumber}
        selected={rightSelected}
        actions={actions}
      />
    </div>
  );
});
