import { ArrowRightOutlined, BranchesOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import { useMergePreview } from '../../../queries/git.js';
import { TextHelper } from '../../../utils/TextHelper.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { RepositoryTag } from '../RepositoryTag.jsx';
import styles from './MergePlan.module.css';

function BranchName({ children }) {
  return (
    <span className={styles.branch}>
      <BranchesOutlined />
      <span className={styles.branchName}>{children}</span>
    </span>
  );
}

/** source → target, the way round a merge goes, or from where to where a switch goes. */
export function MergeDirection({ source, target, label = `${source} into ${target}` }) {
  return (
    <span className={styles.direction} aria-label={label}>
      <BranchName>{source}</BranchName>
      <ArrowRightOutlined className={styles.arrow} />
      <BranchName>{target}</BranchName>
    </span>
  );
}

function describeResult({ commits, fastForward }, noFastForward) {
  if (commits === 0) return { text: 'Up to date', muted: true };
  const count = TextHelper.countOf(commits, 'commit');
  if (fastForward && !noFastForward) return { text: `${count} · fast-forward`, muted: false };
  return { text: `${count} · merge commit`, muted: false };
}

function Result({ preview, noFastForward }) {
  const { text, muted } = describeResult(preview, noFastForward);
  return <span className={muted ? styles.resultMuted : styles.result}>{text}</span>;
}

function describeLeftOut({ branch, missing }) {
  if (missing) return 'not on this machine';
  return branch ? `on ${branch}` : 'detached HEAD';
}

/**
 * Says exactly which branch goes into which, and what that brings in. In a mono repo it
 * does so per repository, and names the ones the merge leaves alone.
 */
export function MergePlan({ source, target, noFastForward = false }) {
  const { repository, status } = useRepositoryContext();
  const { data: preview, isPending, isError } = useMergePreview(repository.id, source, target);

  if (!source || !target) return null;

  const summary = isError ? null : isPending ? (
    <Spin size="small" />
  ) : (
    <Result preview={preview} noFastForward={noFastForward} />
  );

  if (!status.mono) {
    return (
      <div className={styles.plan}>
        <div className={styles.row}>
          <MergeDirection source={source} target={target} />
          {summary}
        </div>
      </div>
    );
  }

  const leftOut = [...(status.mono.following ?? []), ...status.mono.leftOut];
  const byId = new Map((preview?.repositories ?? []).map((entry) => [entry.id, entry]));

  return (
    <div className={styles.plan}>
      <ul className={styles.list} aria-label="Repositories this merge changes">
        {status.mono.members.map((member) => {
          const entry = byId.get(member.id);
          return (
            <li key={member.id} className={styles.row}>
              <RepositoryTag name={member.name} slot={member.slot} className={styles.name} />
              <MergeDirection source={source} target={target} />
              {/* Always a third cell, so the grid stays lined up. */}
              {entry ? (
                <Result preview={entry} noFastForward={noFastForward} />
              ) : isError ? (
                <span />
              ) : (
                <Spin size="small" />
              )}
            </li>
          );
        })}
      </ul>
      {leftOut.length > 0 && (
        <p className={styles.leftOut}>
          Not touched:{' '}
          {leftOut.map((entry, index) => (
            <span key={entry.id}>
              {index > 0 && ', '}
              <RepositoryTag name={entry.name} slot={entry.slot} /> {describeLeftOut(entry)}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
