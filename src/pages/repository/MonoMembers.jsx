import { ClusterOutlined, ExportOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Popover } from 'antd';
import clsx from 'clsx';
import { useNavigate } from 'react-router';
import { AheadBehind } from '../../components/AheadBehind.jsx';
import { Tooltip } from '../../components/Tooltip.jsx';
import { paths } from '../../paths.js';
import { TextHelper } from '../../utils/TextHelper.js';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './MonoMembers.module.css';

function describeLeftOut({ branch, missing, canJoin }, monoBranch) {
  if (missing) return 'Not on this machine';
  const place = branch ? `On ${branch}` : 'Detached HEAD';
  return canJoin ? place : `${place}, and has no ${monoBranch} branch`;
}

/** Where one member's copy of the branch stands, as its own tab would say. */
function describeMember({ upstream, upstreamGone, changes, operation }) {
  const parts = [
    operation && `${operation} in progress`,
    upstreamGone ? `${upstream} is gone` : upstream ? `tracks ${upstream}` : 'not published',
    changes > 0 && TextHelper.countOf(changes, 'change'),
  ];
  return parts.filter(Boolean).join(' · ');
}

function OpenOnItsOwn({ id, name }) {
  const navigate = useNavigate();
  return (
    <Tooltip title={`Open ${name} in a tab of its own`}>
      <Button
        type="text"
        size="small"
        icon={<ExportOutlined />}
        aria-label={`Open ${name} on its own`}
        onClick={() => navigate(paths.repository(id))}
      />
    </Tooltip>
  );
}

function MemberRow({ member }) {
  return (
    <li className={styles.row}>
      <div className={styles.text}>
        <span className={styles.name}>{member.name}</span>
        <span className={styles.detail}>{describeMember(member)}</span>
      </div>
      <AheadBehind ahead={member.ahead} behind={member.behind} />
      <OpenOnItsOwn id={member.id} name={member.name} />
    </li>
  );
}

function LeftOutRow({ repository }) {
  const { status, run, isBusy } = useRepositoryContext();
  const { id, name, canJoin, missing } = repository;

  return (
    <li className={styles.row}>
      <div className={styles.text}>
        <span className={styles.leftOutName}>
          <WarningOutlined className={styles.leftOutIcon} />
          <span className={styles.name}>{name}</span>
        </span>
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
      {!missing && <OpenOnItsOwn id={id} name={name} />}
    </li>
  );
}

function FollowingRow({ repository }) {
  const { status } = useRepositoryContext();
  const { id, name, branch } = repository;
  return (
    <li className={styles.row}>
      <div className={styles.text}>
        <span className={styles.name}>{name}</span>
        <span className={styles.detail}>
          On {branch}, as it has no {status.branch} branch
        </span>
      </div>
      <OpenOnItsOwn id={id} name={name} />
    </li>
  );
}

/** The repositories riding along on their main line, by branch: main → docs, web. */
function groupByBranch(repositories) {
  const groups = new Map();
  for (const repository of repositories) {
    groups.set(repository.branch, [...(groups.get(repository.branch) ?? []), repository]);
  }
  return [...groups].map(([branch, list]) => ({ branch, repositories: list }));
}

/**
 * The other branches in play beside the mono repo's own: the main lines that the
 * repositories without a copy of it are on. Shown next to the branch name.
 */
export function AlongsideBranches() {
  const { status } = useRepositoryContext();
  const following = status.mono?.following ?? [];
  if (following.length === 0) return null;

  const groups = groupByBranch(following);
  const hint = groups
    .map(({ branch, repositories }) => {
      const names = TextHelper.joinWithAnd(repositories.map(({ name }) => name));
      return `${names} ${repositories.length === 1 ? 'is' : 'are'} on ${branch}`;
    })
    .join(', ');

  return (
    <Tooltip title={`${hint}, as ${following.length === 1 ? 'it has' : 'they have'} no ${status.branch}.`}>
      <span className={styles.alongside}>+ {groups.map(({ branch }) => branch).join(', ')}</span>
    </Tooltip>
  );
}

function MembersList() {
  const { status } = useRepositoryContext();
  const { members, leftOut } = status.mono;
  const following = status.mono.following ?? [];

  return (
    <div className={styles.popover}>
      <h4 className={styles.heading}>
        Together on {status.branch} · {TextHelper.countOf(members.length, 'repository', 'repositories')}
      </h4>
      <ul className={styles.list}>
        {members.map((member) => (
          <MemberRow key={member.id} member={member} />
        ))}
      </ul>
      {following.length > 0 && (
        <>
          <h4 className={styles.heading}>Alongside, on their main branch</h4>
          <ul className={styles.list}>
            {following.map((repository) => (
              <FollowingRow key={repository.id} repository={repository} />
            ))}
          </ul>
        </>
      )}
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
  const names = TextHelper.joinWithAnd(members.map(({ name }) => name));

  return (
    <Popover content={<MembersList />} trigger="click" placement="bottomRight">
      <button
        type="button"
        className={clsx(styles.chip, leftOut.length > 0 && styles.chipWarning)}
        aria-label={`Repositories in this mono repo: ${names}`}
        title={names}
      >
        <ClusterOutlined />
        {members.length}
        {leftOut.length > 0 && ` · ${leftOut.length} left out`}
      </button>
    </Popover>
  );
}
