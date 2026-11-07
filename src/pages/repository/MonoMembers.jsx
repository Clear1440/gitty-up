import { CheckOutlined, ClusterOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Popover } from 'antd';
import clsx from 'clsx';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './MonoMembers.module.css';

function describeLeftOut({ branch, missing, canJoin }, monoBranch) {
  if (missing) return 'Not on this machine';
  const place = branch ? `On ${branch}` : 'Detached HEAD';
  return canJoin ? place : `${place}, and has no ${monoBranch} branch`;
}

function LeftOutRow({ repository }) {
  const { status, run, isBusy } = useRepositoryContext();
  const { id, name, canJoin } = repository;

  return (
    <li className={styles.row}>
      <WarningOutlined className={styles.leftOutIcon} />
      <div className={styles.text}>
        <span className={styles.name}>{name}</span>
        <span className={styles.detail}>{describeLeftOut(repository, status.branch)}</span>
      </div>
      {canJoin && (
        <Button
          size="small"
          disabled={isBusy}
          onClick={() => run('joinMono', { repositoryId: id, name, branch: status.branch })}
        >
          Switch to {status.branch}
        </Button>
      )}
    </li>
  );
}

function MembersList() {
  const { status } = useRepositoryContext();
  const { members, leftOut } = status.mono;

  return (
    <div className={styles.popover}>
      <h4 className={styles.heading}>Together on {status.branch}</h4>
      <ul className={styles.list}>
        {members.map(({ id, name }) => (
          <li key={id} className={styles.row}>
            <CheckOutlined className={styles.memberIcon} />
            <span className={styles.name}>{name}</span>
          </li>
        ))}
      </ul>
      {leftOut.length > 0 && (
        <>
          <h4 className={styles.heading}>Left out</h4>
          <ul className={styles.list}>
            {leftOut.map((repository) => (
              <LeftOutRow key={repository.id} repository={repository} />
            ))}
          </ul>
          <p className={styles.note}>
            Only repositories on {status.branch} are part of this tab. Nothing here changes the
            ones left out.
          </p>
        </>
      )}
    </div>
  );
}

/** Says who is in the mono repo, and offers a way back to any that are not. */
export function MonoMembers() {
  const { status } = useRepositoryContext();
  const { members, leftOut } = status.mono;

  return (
    <Popover content={<MembersList />} trigger="click" placement="bottomRight">
      <button
        type="button"
        className={clsx(styles.chip, leftOut.length > 0 && styles.chipWarning)}
        aria-label="Repositories in this mono repo"
      >
        <ClusterOutlined />
        {members.length}
        {leftOut.length > 0 && ` · ${leftOut.length} left out`}
      </button>
    </Popover>
  );
}
