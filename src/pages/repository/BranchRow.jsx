import {
  CheckCircleFilled,
  CloudOutlined,
  LaptopOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Tag } from 'antd';
import clsx from 'clsx';
import { useNavigate } from 'react-router';
import { AheadBehind } from '../../components/AheadBehind.jsx';
import { paths } from '../../paths.js';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './BranchRow.module.css';

function BranchIcon({ branch, kind }) {
  if (branch.isCurrent) return <CheckCircleFilled className={styles.iconCurrent} />;
  return kind === 'remote' ? <CloudOutlined /> : <LaptopOutlined />;
}

export function BranchRow({ branch, label, kind, depth, selected }) {
  const navigate = useNavigate();
  const { repository, status, run, openDialog, isBusy } = useRepositoryContext();

  const isRemote = kind === 'remote';
  const blocked = isBusy || Boolean(status.operation);
  const currentName = status.branch ?? 'HEAD';

  const checkout = () => {
    if (!branch.isCurrent && !blocked) run('checkout', { branch: branch.name, remote: isRemote });
  };

  const open = () => navigate(paths.history(repository.id, branch.name));

  const menuItems = [
    {
      key: 'checkout',
      label: 'Checkout',
      disabled: branch.isCurrent || blocked,
      onClick: checkout,
    },
    ...(branch.isCurrent
      ? []
      : [
          {
            key: 'merge',
            label: `Merge ${branch.name} into ${currentName}`,
            disabled: blocked,
            onClick: () => openDialog('merge', { branch: branch.name }),
          },
        ]),
    // A remote branch can't be committed to, and a detached HEAD has no branch to merge.
    ...(branch.isCurrent || isRemote || !status.branch
      ? []
      : [
          {
            key: 'merge-into',
            label: `Merge ${status.branch} into ${branch.name}`,
            disabled: blocked,
            onClick: () => openDialog('mergeInto', { target: branch.name }),
          },
        ]),
    {
      key: 'rebase',
      label: `Rebase ${currentName} onto this`,
      disabled: branch.isCurrent || blocked,
      onClick: () => openDialog('merge', { branch: branch.name, mode: 'rebase' }),
    },
    {
      key: 'new',
      label: 'New branch from here…',
      onClick: () => openDialog('createBranch', { startPoint: branch.name }),
    },
    { type: 'divider' },
    isRemote
      ? {
          key: 'delete-remote',
          label: branch.remote ? `Delete from ${branch.remote}…` : 'Delete from remote…',
          danger: true,
          disabled: blocked || !branch.remote,
          onClick: () =>
            openDialog('deleteRemoteBranch', {
              name: branch.name,
              remote: branch.remote,
              localName: branch.localName,
            }),
        }
      : {
          key: 'delete',
          label: 'Delete…',
          danger: true,
          disabled: branch.isCurrent,
          onClick: () => openDialog('deleteBranch', { name: branch.name }),
        },
  ];

  const menu = { items: menuItems };

  return (
    <Dropdown menu={menu} trigger={['contextMenu']}>
      <li className={clsx(styles.row, selected && styles.selected)}>
        <button
          type="button"
          className={styles.button}
          style={{ '--branch-depth': depth }}
          title={branch.isCurrent ? branch.name : `${branch.name}\nDouble-click to check out`}
          onClick={open}
          onDoubleClick={checkout}
        >
          <BranchIcon branch={branch} kind={kind} />
          <span className={styles.name}>{label}</span>
          <AheadBehind ahead={branch.ahead} behind={branch.behind} />
          {branch.upstreamGone && <Tag color="warning">gone</Tag>}
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
