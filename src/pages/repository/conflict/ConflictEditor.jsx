import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckOutlined,
  RedoOutlined,
  UndoOutlined,
  VerticalAlignBottomOutlined,
} from '@ant-design/icons';
import { Button, Space, Tooltip } from 'antd';
import clsx from 'clsx';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { KeyboardHelper } from '../../../utils/KeyboardHelper.js';
import { TextHelper } from '../../../utils/TextHelper.js';
import { detectEol, initialLines, joinLines, merge3, splitLines } from './merge3.js';
import styles from './ConflictPage.module.css';

const otherSide = (side) => (side === 'ours' ? 'theirs' : 'ours');

/** Where every chunk starts in each side's file, for line numbers. */
function lineStarts(chunks, side) {
  let line = 1;
  return chunks.map((chunk) => {
    const start = line;
    line += chunk[side].length;
    return start;
  });
}

/**
 * Whether the merged file ends in a newline: whatever a side changed it to, or where
 * neither did, as it was.
 */
function endsInNewline({ base, ours, theirs }) {
  const [b, o, t] = [base, ours, theirs].map((text) => splitLines(text).finalNewline);
  if (ours === null) return t;
  if (theirs === null) return o;
  return o === b ? t : o;
}

function prepare(conflict) {
  const [base, ours, theirs] = [conflict.base, conflict.ours, conflict.theirs].map(
    (text) => splitLines(text).lines,
  );
  const chunks = merge3(base, ours, theirs);
  return {
    chunks,
    starts: { ours: lineStarts(chunks, 'ours'), theirs: lineStarts(chunks, 'theirs') },
    eol: detectEol(conflict.working, conflict.ours, conflict.theirs),
    finalNewline: endsInNewline(conflict),
  };
}

/** Each chunk of the working file: its lines, null while a conflict is open, and how it got them. */
const startingState = (chunk) => ({ lines: initialLines(chunk), picks: [], edited: false });

/**
 * A chunk's state after the user acts on it. `take` uses one side's lines in place of
 * what is there, and `addBelow` adds a side's lines under them: both get the side as
 * `value`. `edit` gets the typed text, and `reset` puts the chunk back as it started.
 */
function applyAction(type, chunk, state, value) {
  switch (type) {
    case 'take':
      return { lines: chunk[value], picks: [value], edited: false };
    case 'addBelow':
      return {
        lines: [...(state.lines ?? []), ...chunk[value]],
        picks: [...state.picks, value],
        edited: state.edited,
      };
    case 'edit':
      return { ...state, lines: value === '' ? [] : value.split('\n'), edited: true };
    case 'reset':
      return startingState(chunk);
    default:
      return state;
  }
}

const Lines = memo(function Lines({ lines, start }) {
  return lines.map((line, index) => (
    <div key={index} className={styles.line}>
      <span className={styles.lineNumber}>{start + index}</span>
      {/* An empty line still needs its height. */}
      <span className={styles.code}>{line || ' '}</span>
    </div>
  ));
});

/** A textarea that grows to fit its text, so the three panes scroll as one. */
function GrowingTextarea({ value, onChange, ...props }) {
  const ref = useRef(null);

  const fit = useCallback(() => {
    const textarea = ref.current;
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  useLayoutEffect(fit, [value, fit]);

  // Lines wrap, so a change of width or font changes the height too.
  useEffect(() => {
    const textarea = ref.current;
    document.fonts?.ready.then(fit);
    let width = textarea.clientWidth;
    const observer = new ResizeObserver(() => {
      if (textarea.clientWidth === width) return;
      width = textarea.clientWidth;
      fit();
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <textarea
      ref={ref}
      rows={1}
      spellCheck={false}
      autoCapitalize="off"
      autoComplete="off"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      {...props}
    />
  );
}

function SideCell({ index, chunk, side, start, state, label, act }) {
  const lines = chunk[side];
  const isConflict = chunk.kind === 'conflict';
  const changed = chunk.kind === side || chunk.kind === 'both';
  const picked = state.picks.includes(side);
  const canAddBelow = state.picks.includes(otherSide(side)) && !picked;
  const arrow = side === 'ours' ? <ArrowRightOutlined /> : <ArrowLeftOutlined />;

  return (
    <div
      className={clsx(
        styles.cell,
        styles.side,
        side === 'ours' ? styles.left : styles.right,
        isConflict && styles.conflictSide,
        changed && styles.changedSide,
        picked && styles.pickedSide,
      )}
    >
      {isConflict && (
        <div className={styles.chunkBar}>
          <Tooltip title={`Put ${label}'s lines in the working file, in place of what is there`}>
            <Button
              size="small"
              type={picked ? 'primary' : 'default'}
              icon={picked ? <CheckOutlined /> : arrow}
              iconPlacement={side === 'ours' ? 'end' : 'start'}
              onClick={() => act('take', index, side)}
            >
              {picked ? 'Used' : 'Use this'}
            </Button>
          </Tooltip>
          <Tooltip
            title={
              picked
                ? `${label}'s lines are already in the working file`
                : canAddBelow
                  ? `Add ${label}'s lines under the ones already taken`
                  : `Use the other side first, then add ${label}'s lines under them`
            }
          >
            <Button
              size="small"
              icon={<VerticalAlignBottomOutlined />}
              disabled={!canAddBelow}
              onClick={() => act('addBelow', index, side)}
            >
              Add below
            </Button>
          </Tooltip>
        </div>
      )}
      <Lines lines={lines} start={start} />
      {lines.length === 0 && chunk.kind !== 'stable' && (
        <div className={styles.noLines}>No lines here</div>
      )}
    </div>
  );
}

function describeResolution({ picks, edited }) {
  if (edited) return 'Edited by hand';
  if (picks.length === 2) return `Both sides, ${picks[0] === 'ours' ? 'left' : 'right'} first`;
  return picks[0] === 'ours' ? 'Using the left side' : 'Using the right side';
}

function MiddleCell({ index, chunk, state, act }) {
  const isConflict = chunk.kind === 'conflict';
  const open = state.lines === null;
  const autoMerged = chunk.kind !== 'stable' && !isConflict;

  // A side's taller chunk leaves space under the text, and a click there edits it too.
  const focusEnd = (event) => {
    if (event.target !== event.currentTarget) return;
    const textarea = event.currentTarget.querySelector('textarea');
    event.preventDefault();
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  };

  return (
    // The textarea inside is what keyboard users reach. This only widens its click target.
    <div
      data-chunk={index}
      onMouseDown={focusEnd}
      className={clsx(
        styles.cell,
        styles.middle,
        isConflict && (open ? styles.openConflict : styles.resolvedConflict),
        autoMerged && styles.autoMerged,
      )}
    >
      {isConflict && (
        <div className={styles.chunkBar}>
          <span className={styles.chunkStatus}>
            {open ? 'Conflict: use a side, or type the result here' : describeResolution(state)}
          </span>
          {!open && (
            <Button size="small" type="text" onClick={() => act('reset', index)}>
              Reset
            </Button>
          )}
        </div>
      )}
      <GrowingTextarea
        className={styles.editor}
        aria-label={`Working file, part ${index + 1}`}
        placeholder={open ? 'Unresolved' : undefined}
        value={state.lines?.join('\n') ?? ''}
        onChange={(text) => act('edit', index, text)}
      />
    </div>
  );
}

/** One chunk across the three panes. Rows share a grid, so each side stays level. */
const ChunkRow = memo(function ChunkRow({ index, chunk, starts, state, labels, act }) {
  return (
    <>
      <SideCell
        index={index}
        chunk={chunk}
        side="ours"
        start={starts.ours[index]}
        state={state}
        label={labels.ours}
        act={act}
      />
      <MiddleCell index={index} chunk={chunk} state={state} act={act} />
      <SideCell
        index={index}
        chunk={chunk}
        side="theirs"
        start={starts.theirs[index]}
        state={state}
        label={labels.theirs}
        act={act}
      />
    </>
  );
});

const ACCEPT_ALL = {
  left: ['ours'],
  right: ['theirs'],
};

/** Whether a chunk is a change one or both sides made that git could merge on its own. */
const isMergeable = (chunk) => chunk.kind !== 'stable' && chunk.kind !== 'conflict';

/** Whether a mergeable chunk no longer holds what git merged, as after an edit. */
const differsFromMerged = (chunk, state) =>
  state.edited || state.lines !== initialLines(chunk) || state.picks.length > 0;

const OPEN_DIALOG = '.ant-modal';

/**
 * Ctrl+Z (Cmd+Z) undoes, and Ctrl+Y or Ctrl+Shift+Z redoes. Gives 'undo', 'redo' or null.
 */
function readHistoryKey(event) {
  if (!KeyboardHelper.hasCommandKey(event) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return null;
}

/**
 * The working file's chunks with their undo history. `change` gets the current states
 * and gives the next. Changes with the same `group`, such as typing into one chunk,
 * undo together.
 */
function useStatesHistory(chunks) {
  const [history, setHistory] = useState(() => ({
    past: [],
    present: chunks.map(startingState),
    future: [],
    group: null,
  }));

  const update = useCallback((change, group = null) => {
    setHistory((current) => {
      const next = change(current.present);
      if (next === current.present) return current;
      const merges = group !== null && group === current.group;
      return {
        past: merges ? current.past : [...current.past, current.present],
        present: next,
        future: [],
        group,
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory(({ past, present, future }) =>
      past.length === 0
        ? { past, present, future, group: null }
        : { past: past.slice(0, -1), present: past.at(-1), future: [present, ...future], group: null },
    );
  }, []);

  const redo = useCallback(() => {
    setHistory(({ past, present, future }) =>
      future.length === 0
        ? { past, present, future, group: null }
        : { past: [...past, present], present: future[0], future: future.slice(1), group: null },
    );
  }, []);

  return {
    states: history.present,
    update,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}

/**
 * Three panes: the branch being merged into, the working file, and the branch being
 * merged in. The working file starts with every change that doesn't conflict already
 * taken, and can be edited freely.
 */
export function ConflictEditor({ conflict, isBusy, onSave, onCancel }) {
  const { chunks, starts, eol, finalNewline } = useMemo(() => prepare(conflict), [conflict]);
  const { states, update, undo, redo, canUndo, canRedo } = useStatesHistory(chunks);
  const scrollerRef = useRef(null);
  const lastJump = useRef(-1);

  /** Changes one chunk of the working file. See `applyAction` for what each `type` does. */
  const act = useCallback(
    (type, index, value) => {
      update(
        (current) =>
          current.map((state, position) =>
            position === index ? applyAction(type, chunks[index], state, value) : state,
          ),
        // A run of typing in one chunk undoes as one change, not a letter at a time.
        type === 'edit' ? `edit:${index}` : null,
      );
    },
    [chunks, update],
  );

  const acceptAll = (which) => {
    const sides = ACCEPT_ALL[which];
    update((current) =>
      current.map((state, index) => {
        const chunk = chunks[index];
        if (chunk.kind !== 'conflict') return state;
        return { lines: sides.flatMap((side) => chunk[side]), picks: sides, edited: false };
      }),
    );
  };

  /** Puts back every change git merged from either side, leaving the conflicts as they are. */
  const acceptMergeable = () => {
    update((current) =>
      current.map((state, index) =>
        isMergeable(chunks[index]) && differsFromMerged(chunks[index], state)
          ? startingState(chunks[index])
          : state,
      ),
    );
  };

  // Undo here is for the working file, not the latest commit as elsewhere in the app.
  useEffect(() => {
    const handleKeyDown = (event) => {
      const action = readHistoryKey(event);
      if (!action || document.querySelector(OPEN_DIALOG)) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === 'undo') undo();
      else redo();
    };
    // Capturing, so the commit shortcut and a textarea's own undo never see the key.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [undo, redo]);

  const conflictIndexes = chunks.flatMap((chunk, index) => (chunk.kind === 'conflict' ? index : []));
  const openIndexes = conflictIndexes.filter((index) => states[index].lines === null);

  /** Scrolls a chunk to the middle of the view, and remembers it for "next conflict". */
  const scrollToChunk = useCallback((index, behavior) => {
    lastJump.current = index;
    scrollerRef.current
      ?.querySelector(`[data-chunk="${index}"]`)
      ?.scrollIntoView({ block: 'center', behavior });
  }, []);

  const jumpToNextOpen = () => {
    const next = openIndexes.find((index) => index > lastJump.current) ?? openIndexes[0];
    if (next !== undefined) scrollToChunk(next, 'smooth');
  };

  // Start at the first conflict rather than the top of a long file.
  useEffect(() => {
    const first = chunks.findIndex((chunk) => chunk.kind === 'conflict');
    if (first > 0) scrollToChunk(first);
  }, [chunks, scrollToChunk]);

  const save = () => {
    const lines = states.flatMap((state) => state.lines ?? []);
    onSave(joinLines(lines, { eol, finalNewline }));
  };

  const hasConflicts = conflictIndexes.length > 0;
  const openCount = openIndexes.length;
  const hasMergeableChanges = chunks.some(
    (chunk, index) => isMergeable(chunk) && differsFromMerged(chunk, states[index]),
  );

  return (
    <div className={styles.editorPage}>
      <div className={styles.toolbar}>
        <Space wrap size="small">
          <Button size="small" disabled={!hasConflicts} onClick={() => acceptAll('left')}>
            Accept all from left
          </Button>
          <Tooltip title="Take every change from both sides that doesn't conflict. Conflicts stay as they are.">
            <Button size="small" disabled={!hasMergeableChanges} onClick={acceptMergeable}>
              Accept all from both
            </Button>
          </Tooltip>
          <Button size="small" disabled={!hasConflicts} onClick={() => acceptAll('right')}>
            Accept all from right
          </Button>
        </Space>
        <div className={styles.summary}>
          <span className={styles.filePath} title={conflict.path}>
            {conflict.path}
          </span>
          {hasConflicts ? (
            <Button
              size="small"
              type="link"
              className={clsx(openCount > 0 ? styles.openCount : styles.doneCount)}
              disabled={openCount === 0}
              onClick={jumpToNextOpen}
            >
              {openCount > 0
                ? `${openCount} of ${TextHelper.countOf(conflictIndexes.length, 'conflict')} left`
                : 'All conflicts resolved'}
            </Button>
          ) : (
            <span className={styles.doneCount}>No conflicting lines. Check it, then save.</span>
          )}
        </div>
        <Space size="small">
          <Tooltip title="Undo (Ctrl+Z)">
            <Button
              size="small"
              type="text"
              icon={<UndoOutlined />}
              aria-label="Undo"
              disabled={!canUndo}
              onClick={undo}
            />
          </Tooltip>
          <Tooltip title="Redo (Ctrl+Y)">
            <Button
              size="small"
              type="text"
              icon={<RedoOutlined />}
              aria-label="Redo"
              disabled={!canRedo}
              onClick={redo}
            />
          </Tooltip>
          <Button size="small" onClick={onCancel}>
            Cancel
          </Button>
          <Tooltip title={openCount > 0 ? 'Resolve every conflict first' : undefined}>
            <Button
              size="small"
              type="primary"
              disabled={openCount > 0 || isBusy}
              loading={isBusy}
              onClick={save}
            >
              Save and mark resolved
            </Button>
          </Tooltip>
        </Space>
      </div>
      <div ref={scrollerRef} className={styles.scroller}>
        <div className={styles.grid}>
          <div className={clsx(styles.heading, styles.left)}>
            <span className={styles.headingLabel}>Branch merging to</span>
            <span className={styles.branch}>{conflict.labels.ours}</span>
            {conflict.ours === null && <span className={styles.deleted}>deleted</span>}
          </div>
          <div className={styles.heading}>
            <span className={styles.headingLabel}>Working file</span>
          </div>
          <div className={clsx(styles.heading, styles.right)}>
            <span className={styles.headingLabel}>Branch merging from</span>
            <span className={styles.branch}>{conflict.labels.theirs}</span>
            {conflict.theirs === null && <span className={styles.deleted}>deleted</span>}
          </div>
          {chunks.map((chunk, index) => (
            <ChunkRow
              key={index}
              index={index}
              chunk={chunk}
              starts={starts}
              state={states[index]}
              labels={conflict.labels}
              act={act}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
