import {
  CheckCircleFilled,
  CloudOutlined,
  DisconnectOutlined,
  LaptopOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { Button, Dropdown } from 'antd';
import clsx from 'clsx';
import { useNavigate } from 'react-router';
import { AheadBehind } from '../../components/AheadBehind.jsx';
import { TreeIcon } from '../../components/TreeIcon.jsx';
import { paths } from '../../paths.js';
import { TextHelper } from '../../utils/TextHelper.js';
import { useRepositoryContext } from './RepositoryContext.js';
import { useBranchMenu } from './useBranchMenu.js';
import styles from './BranchRow.module.css';

/** The folder of another working tree a local branch is checked out in, if it is. */
const otherWorktreeOf = (branch, kind) =>
  kind === 'local' && !branch.isCurrent ? branch.worktreePath : null;

function BranchIcon({ branch, kind }) {
  if (branch.isCurrent) return <CheckCircleFilled className={styles.iconCurrent} />;
  if (otherWorktreeOf(branch, kind)) {
    return <TreeIcon className={styles.iconWorktree} aria-label="Checked out in another worktree" />;
  }
  return kind === 'remote' ? <CloudOutlined /> : <LaptopOutlined />;
}

/** A line on where a local branch syncs with, for its tooltip. Remote branches have none. */
function describeUpstream(branch, kind) {
  if (kind === 'remote') return null;
  if (!branch.upstream) return 'Not on a remote yet';
  if (branch.upstreamGone) return `Its upstream, ${branch.upstream}, was deleted from the remote`;
  const counts = [
    branch.ahead > 0 && `${TextHelper.countOf(branch.ahead, 'commit')} to push`,
    branch.behind > 0 && `${TextHelper.countOf(branch.behind, 'commit')} to pull`,
  ].filter(Boolean);
  return `Tracks ${branch.upstream}${counts.length > 0 ? `: ${counts.join(', ')}` : ', up to date'}`;
}

export function BranchRow({ branch, label, kind, depth, selected }) {
  const navigate = useNavigate();
  const { repository } = useRepositoryContext();
  const { items, checkout } = useBranchMenu(branch, kind);
  const worktreePath = otherWorktreeOf(branch, kind);

  // The time makes every click a new request, so a branch scrolled away from can be found again.
  const focus = () => {
    navigate(paths.focusBranch(repository.id, branch.name), {
      state: { focusBranch: Date.now() },
    });
  };

  const menu = { items };

  return (
    <Dropdown menu={menu} trigger={['contextMenu']}>
      <li
        className={clsx(
          styles.row,
          selected && styles.selected,
          branch.isCurrent && styles.current,
          branch.upstreamGone && styles.gone,
        )}
      >
        <button
          type="button"
          className={styles.button}
          style={{ '--branch-depth': depth }}
          aria-current={branch.isCurrent || undefined}
          title={[
            branch.isCurrent ? `${branch.name} (checked out)` : branch.name,
            describeUpstream(branch, kind),
            worktreePath && `Checked out in ${worktreePath}. Double-click to open it.`,
            !branch.isCurrent && !worktreePath && 'Double-click to check out',
          ]
            .filter(Boolean)
            .join('\n')}
          onClick={focus}
          onDoubleClick={checkout}
        >
          <BranchIcon branch={branch} kind={kind} />
          <span className={styles.name}>{label}</span>
          <AheadBehind ahead={branch.ahead} behind={branch.behind} />
          {branch.upstreamGone && (
            <span className={styles.goneMark}>
              <DisconnectOutlined /> gone
            </span>
          )}
        </button>
        <Dropdown menu={menu} trigger={['click']}>
          <Button
            className={styles.menu}
            type="text"
            size="small"
            icon={<MoreOutlined />}
            aria-label={`Actions for ${branch.name}`}
          />
        </Dropdown>
      </li>
    </Dropdown>
  );
}
