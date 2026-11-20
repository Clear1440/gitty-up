import { DeleteOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
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
    // Read by DiffContent, to show this line's buttons while it is pointed at or focused.
    'data-line-id': line.id,
    onClick: handleClick,
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleClick(event);
      }
    },
  };
}

/** A small icon button on a line, which acts on that line alone and not as a click on it. */
function LineAction({ label, icon, danger, onClick }) {
  return (
    <button
      type="button"
      className={clsx(styles.lineAction, danger && styles.lineActionDanger)}
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {icon}
    </button>
  );
}

/** Stage or unstage, and discard, for the line being pointed at or focused. */
function LineActions({ line, actions }) {
  if (!actions.onStage || line.kind === 'context') return null;
  const isUnstage = actions.stageLabel === 'Unstage';
  return (
    <span className={styles.lineActions}>
      {actions.onDiscard && (
        <LineAction
          label="Discard this line"
          icon={<DeleteOutlined />}
          danger
          onClick={() => actions.onDiscard([line.id])}
        />
      )}
      <LineAction
        label={`${actions.stageLabel} this line`}
        icon={isUnstage ? <MinusOutlined /> : <PlusOutlined />}
        onClick={() => actions.onStage(line.id)}
      />
    </span>
  );
}

export const HunkRow = memo(function HunkRow({
  text,
  ids,
  label,
  disabled,
  onApply,
  onDiscard,
}) {
  return (
    <div className={clsx(styles.row, styles.hunk)}>
      <span className={styles.hunkText}>{text}</span>
      {onApply && (
        <span className={styles.hunkActions}>
          {onDiscard && (
            <Button size="small" danger disabled={disabled} onClick={() => onDiscard(ids)}>
              Discard hunk
            </Button>
          )}
          <Button size="small" disabled={disabled} onClick={() => onApply(ids)}>
            {label}
          </Button>
        </span>
      )}
    </div>
  );
});

export const LineRow = memo(function LineRow({ line, selected, active, actions }) {
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
      {active && <LineActions line={line} actions={actions} />}
    </div>
  );
});

function SplitSide({ line, number, selected, active, actions }) {
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
      {active && <LineActions line={line} actions={actions} />}
    </div>
  );
}

export const PairRow = memo(function PairRow({
  left,
  right,
  leftSelected,
  rightSelected,
  activeId,
  actions,
}) {
  return (
    <div className={styles.pair}>
      <SplitSide
        line={left}
        number={left?.oldNumber}
        selected={leftSelected}
        active={Boolean(left) && left.id === activeId}
        actions={actions}
      />
      <SplitSide
        line={right}
        number={right?.newNumber}
        selected={rightSelected}
        active={Boolean(right) && right.id === activeId}
        actions={actions}
      />
    </div>
  );
});
