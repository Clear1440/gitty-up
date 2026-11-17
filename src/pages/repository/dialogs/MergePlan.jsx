import { Spin } from 'antd';
import { useMergePreview } from '../../../queries/git.js';
import { TextHelper } from '../../../utils/TextHelper.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import styles from './MergePlan.module.css';

/** source → target in plain text: the way round a merge goes, or where a switch goes. */
export function MergeDirection({ source, target, label = `${source} into ${target}` }) {
  return (
    <span className={styles.direction} aria-label={label} title={`${source} → ${target}`}>
      {source} → {target}
    </span>
  );
}

function describeResult({ commits, fastForward }, noFastForward) {
  if (commits === 0) return { text: 'Up to date', muted: true };
  const count = TextHelper.countOf(commits, 'commit');
  if (fastForward && !noFastForward) return { text: `${count}, fast-forward`, muted: false };
  return { text: `${count}, merge commit`, muted: false };
}

function Result({ preview, noFastForward }) {
  const { text, muted } = describeResult(preview, noFastForward);
  return <span className={muted ? styles.muted : undefined}>{text}</span>;
}

function describeLeftOut({ name, branch, missing }) {
  if (missing) return `${name} (not on this machine)`;
  return `${name} (${branch ?? 'detached HEAD'})`;
}

/**
 * Says, for each repository in a mono repo, what merging `source` into `target` brings in,
 * and names the ones the merge leaves alone. Mono repos only.
 */
export function MergePlan({ source, target, noFastForward = false }) {
  const { repository, status } = useRepositoryContext();
  const { data: preview, isPending, isError } = useMergePreview(repository.id, source, target);

  if (!source || !target) return null;

  const pending = isError ? null : <Spin size="small" />;

  const leftOut = [...(status.mono.following ?? []), ...status.mono.leftOut];
  const byId = new Map((preview?.repositories ?? []).map((entry) => [entry.id, entry]));

  return (
    <div className={styles.plan}>
      <div className={styles.heading}>
        <MergeDirection source={source} target={target} />
      </div>
      <ul className={styles.list} aria-label="Repositories this merge changes">
        {status.mono.members.map((member) => {
          const entry = byId.get(member.id);
          return (
            <li key={member.id} className={styles.row}>
              <span className={styles.name}>{member.name}</span>
              {entry ? <Result preview={entry} noFastForward={noFastForward} /> : isPending && pending}
            </li>
          );
        })}
      </ul>
      {leftOut.length > 0 && (
        <p className={styles.leftOut}>Not touched: {leftOut.map(describeLeftOut).join(', ')}</p>
      )}
    </div>
  );
}
