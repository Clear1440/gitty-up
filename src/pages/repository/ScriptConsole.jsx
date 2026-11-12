import {
  CheckCircleFilled,
  CloseCircleFilled,
  CopyOutlined,
  LoadingOutlined,
  RedoOutlined,
  StopOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { Button, Drawer } from 'antd';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCopyToClipboard } from '../../utils/useCopyToClipboard.js';
import { toConsoleText } from './consoleText.js';
import styles from './ScriptConsole.module.css';

const formatDuration = (ms) => {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
};

/** The time, updated every second while `active`, for a running clock. */
function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function RunStatus({ run }) {
  const running = run.status === 'running';
  const now = useNow(running);
  const duration = formatDuration(running ? now - Date.parse(run.startedAt) : run.durationMs);

  if (running) {
    return (
      <span className={styles.status}>
        <LoadingOutlined /> Running · {duration}
      </span>
    );
  }
  if (run.status === 'lost') {
    return (
      <span className={styles.status}>
        <WarningFilled className={styles.warning} /> Lost touch with the server, so its end is unknown
      </span>
    );
  }
  if (run.stopReason) {
    return (
      <span className={styles.status}>
        <StopOutlined className={styles.warning} />
        {run.stopReason === 'timeout' ? 'Timed out' : 'Stopped'} · {duration}
      </span>
    );
  }
  if (run.exitCode === 0) {
    return (
      <span className={styles.status}>
        <CheckCircleFilled className={styles.success} /> Finished · {duration}
      </span>
    );
  }
  return (
    <span className={styles.status}>
      <CloseCircleFilled className={styles.danger} /> Failed with exit code {run.exitCode} · {duration}
    </span>
  );
}

/**
 * Keeps a scrolling box pinned to its end as content arrives, unless the user has
 * scrolled up to read something, until they scroll back down.
 */
function useStickToBottom(content) {
  const ref = useRef(null);
  const pinned = useRef(true);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [content]);

  const onScroll = () => {
    const element = ref.current;
    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
  };

  return { ref, onScroll };
}

function ParamsSummary({ params }) {
  const entries = Object.entries(params ?? {});
  if (entries.length === 0) return null;
  return (
    <div className={styles.params}>
      {entries.map(([name, value]) => (
        <code key={name} className={styles.paramChip}>
          {name}={value === null || value === '' ? '—' : String(value)}
        </code>
      ))}
    </div>
  );
}

/**
 * A console at the bottom of the window showing a script's output as it runs. It does
 * not block the page, so work can go on while the script does.
 */
export function ScriptConsole({ run, open, onClose, onStop, onRunAgain, stopping }) {
  const text = useMemo(() => toConsoleText(run.output), [run.output]);
  const { ref, onScroll } = useStickToBottom(text);
  const copy = useCopyToClipboard();
  const running = run.status === 'running';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="bottom"
      mask={false}
      resizable
      defaultSize={320}
      maxSize={Math.round(window.innerHeight * 0.85)}
      className={styles.drawer}
      title={
        <div className={styles.title}>
          <span className={styles.name}>{run.name}</span>
          <RunStatus run={run} />
        </div>
      }
      extra={
        <div className={styles.actions}>
          <Button
            size="small"
            icon={<CopyOutlined />}
            disabled={!text.trim()}
            onClick={() => copy(text, 'the output')}
          >
            Copy
          </Button>
          {running ? (
            <Button size="small" danger icon={<StopOutlined />} loading={stopping} onClick={onStop}>
              Stop
            </Button>
          ) : (
            <Button size="small" icon={<RedoOutlined />} onClick={onRunAgain}>
              Run again
            </Button>
          )}
        </div>
      }
    >
      <ParamsSummary params={run.params} />
      <pre ref={ref} onScroll={onScroll} className={styles.output} aria-live="polite">
        {text || <span className={styles.placeholder}>{running ? 'Waiting for output…' : 'No output'}</span>}
      </pre>
    </Drawer>
  );
}
