import { ClearOutlined, EditOutlined, EyeOutlined, RightOutlined, UndoOutlined } from '@ant-design/icons';
import { App, Button, Empty, Segmented, Spin } from 'antd';
import { useState } from 'react';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { Tooltip } from '../../components/Tooltip.jsx';
import { useConfirmDanger } from '../../components/useConfirmDanger.js';
import { useAiActivity, useClearAiActivity, useUndoAiActivity } from '../../queries/aiActivity.js';
import { argumentRows, describeHead, outcomeLabel, visibleEntries } from './aiActivity.js';
import styles from './AiActivity.module.css';

const FILTER_OPTIONS = [
  { value: 'changes', label: 'Changes', icon: <EditOutlined /> },
  { value: 'everything', label: 'Everything', icon: <EyeOutlined /> },
];

const OUTCOME_CLASSES = { Done: styles.done, Failed: styles.failed, Undone: styles.undone };

function UndoButton({ entry }) {
  const { message, notification } = App.useApp();
  const confirmDanger = useConfirmDanger();
  const undo = useUndoAiActivity();
  const { undo: plan } = entry;

  if (!plan) return <span />;
  if (!plan.available) {
    return (
      <Tooltip title={plan.reason}>
        {/* A disabled button gets no pointer events, so the wrapper shows the tooltip. */}
        <span className={styles.disabledWrapper}>
          <Button type="text" size="small" icon={<UndoOutlined />} disabled aria-label="Undo" />
        </span>
      </Tooltip>
    );
  }

  const confirmUndo = () =>
    confirmDanger({
      title: `Undo ${entry.tool} in ${entry.repository.name}?`,
      content: plan.description,
      okText: 'Undo',
      onOk: async () => {
        try {
          await undo.mutateAsync(entry.id);
          message.success('Undone');
        } catch (error) {
          notification.error({ title: 'Could not undo that', description: error.message });
        }
      },
    });

  return (
    <Tooltip title={`Undo: ${plan.description}`}>
      <Button
        type="text"
        size="small"
        icon={<UndoOutlined />}
        aria-label="Undo"
        loading={undo.isPending}
        onClick={confirmUndo}
      />
    </Tooltip>
  );
}

function EntryDetails({ entry }) {
  const rows = argumentRows(entry.args);
  const before = describeHead(entry.before);
  const after = describeHead(entry.after);
  return (
    <dl className={styles.details}>
      {entry.error && (
        <div className={styles.detailRow}>
          <dt>Error</dt>
          <dd className={styles.error}>{entry.error}</dd>
        </div>
      )}
      {rows.map(({ key, value }) => (
        <div key={key} className={styles.detailRow}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      {before && (
        <div className={styles.detailRow}>
          <dt>Before</dt>
          <dd>{before}</dd>
        </div>
      )}
      {after && (
        <div className={styles.detailRow}>
          <dt>After</dt>
          <dd>{after}</dd>
        </div>
      )}
      <div className={styles.detailRow}>
        <dt>Took</dt>
        <dd>{entry.durationMs} ms</dd>
      </div>
      {entry.undone && (
        <div className={styles.detailRow}>
          <dt>Undone</dt>
          <dd>
            <RelativeTime date={entry.undone.time} />
          </dd>
        </div>
      )}
    </dl>
  );
}

function EntryRow({ entry }) {
  const [isOpen, setOpen] = useState(false);
  const outcome = outcomeLabel(entry);
  return (
    <li className={styles.entry}>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={isOpen}
          onClick={() => setOpen((open) => !open)}
        >
          <RightOutlined className={isOpen ? styles.chevronOpen : styles.chevron} />
          <RelativeTime className={styles.time} date={entry.time} />
          <span className={styles.tool}>
            {entry.tool}
            {!entry.write && <span className={styles.readTag}>read</span>}
          </span>
          <span className={styles.repository}>{entry.repository?.name ?? '—'}</span>
          <span className={`${styles.outcome} ${OUTCOME_CLASSES[outcome]}`}>{outcome}</span>
        </button>
        <UndoButton entry={entry} />
      </div>
      {isOpen && <EntryDetails entry={entry} />}
    </li>
  );
}

/**
 * What AI tools did through the MCP server, newest first, with undo for the changes that
 * can safely be taken back. Shows changes only until asked for everything.
 */
export function AiActivity({ isLive }) {
  const { notification } = App.useApp();
  const confirmDanger = useConfirmDanger();
  const [filter, setFilter] = useState('changes');
  const { data: entries, isPending, error } = useAiActivity({ isLive });
  const clear = useClearAiActivity();
  const shown = entries ? visibleEntries(entries, filter === 'everything') : [];

  const confirmClear = () =>
    confirmDanger({
      title: 'Clear the activity log?',
      content: 'Every entry goes, and what they did can no longer be undone from here.',
      okText: 'Clear',
      onOk: async () => {
        try {
          await clear.mutateAsync();
        } catch (clearError) {
          notification.error({ title: 'Could not clear the log', description: clearError.message });
        }
      },
    });

  return (
    <div className={styles.activity}>
      <div className={styles.toolbar}>
        <Segmented aria-label="Show" options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
        <Tooltip title="Clear the log">
          <Button
            icon={<ClearOutlined />}
            aria-label="Clear the log"
            disabled={!entries?.length}
            loading={clear.isPending}
            onClick={confirmClear}
          />
        </Tooltip>
      </div>
      {isPending && <Spin className="centered" />}
      {error && <div className={styles.error}>Could not load the log. {error.message}</div>}
      {entries && shown.length === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={filter === 'changes' ? 'No AI tool has changed anything yet.' : 'No AI tool has done anything yet.'}
        />
      )}
      {shown.length > 0 && (
        <ul className={styles.list}>
          {shown.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}
