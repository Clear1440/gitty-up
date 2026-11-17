import { ClusterOutlined, ExportOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Popover } from 'antd';
import clsx from 'clsx';
import { useNavigate } from 'react-router';
import { AheadBehind } from '../../components/AheadBehind.jsx';
import { Tooltip } from '../../components/Tooltip.jsx';
import { paths } from '../../paths.js';
import { TextHelper } from '../../utils/TextHelper.js';
import { useRepositoryContext } from './RepositoryContext.js';
import { RepositoryDot, RepositoryTag } from './RepositoryTag.jsx';
import styles from './MonoMembers.module.css';

/** How many dots the chip shows before it just counts. */
const MAX_DOTS = 6;

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
        <RepositoryTag name={member.name} slot={member.slot} className={styles.tag} />
        <span className={styles.detail}>{describeMember(member)}</span>
      </div>
      <AheadBehind ahead={member.ahead} behind={member.behind} />
      <OpenOnItsOwn id={member.id} name={member.name} />
    </li>
  );
}

function LeftOutRow({ repository }) {
  const { status, run, isBusy } = useRepositoryContext();
  const { id, name, slot, canJoin, missing } = repository;

  return (
    <li className={styles.row}>
      <div className={styles.text}>
        <span className={styles.leftOutName}>
          <WarningOutlined className={styles.leftOutIcon} />
          <RepositoryTag name={name} slot={slot} className={styles.tag} />
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

function MembersList() {
  const { status } = useRepositoryContext();
  const { members, leftOut } = status.mono;

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

/** Says who is in the mono repo, each in its color, and offers a way back to any that are not. */
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
        {members.length <= MAX_DOTS ? (
          <span className={styles.dots}>
            {members.map(({ id, slot }) => (
              <RepositoryDot key={id} slot={slot} />
            ))}
          </span>
        ) : (
          members.length
        )}
        {leftOut.length > 0 && ` · ${leftOut.length} left out`}
      </button>
    </Popover>
  );
}
