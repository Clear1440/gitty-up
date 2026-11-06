import {
  BranchesOutlined,
  CheckCircleFilled,
  CloudOutlined,
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
  return kind === 'remote' ? <CloudOutlined /> : <BranchesOutlined />;
}

export function BranchRow({ branch, kind, selected }) {
  const navigate = useNavigate();
  const { repository, status, run, openDialog, isBusy } = useRepositoryContext();

  const isRemote = kind === 'remote';
  const blocked = isBusy || Boolean(status.operation);
  const currentName = status.branch ?? 'HEAD';

  const checkout = () => {
    if (!branch.isCurrent && !blocked) run('checkout', { branch: branch.name, remote: isRemote });
  };

  // Work in progress only exists on the checked out branch, so that is where it opens.
  const open = () => {
    navigate(
      branch.isCurrent ? paths.changes(repository.id) : paths.history(repository.id, branch.name),
    );
  };

  const menuItems = [
    {
      key: 'checkout',
      label: 'Checkout',
      disabled: branch.isCurrent || blocked,
      onClick: checkout,
    },
    {
      key: 'merge',
      label: `Merge into ${currentName}`,
      disabled: branch.isCurrent || blocked,
      onClick: () => openDialog('merge', { branch: branch.name }),
    },
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
    ...(isRemote
      ? []
      : [
          { type: 'divider' },
          {
            key: 'delete',
            label: 'Delete…',
            danger: true,
            disabled: branch.isCurrent,
            onClick: () => openDialog('deleteBranch', { name: branch.name }),
          },
        ]),
  ];

  return (
    <li className={clsx(styles.row, selected && styles.selected)}>
      <button
        type="button"
        className={styles.button}
        title={branch.isCurrent ? branch.name : `${branch.name}\nDouble-click to check out`}
        onClick={open}
        onDoubleClick={checkout}
      >
        <BranchIcon branch={branch} kind={kind} />
        <span className={styles.name}>{branch.name}</span>
        <AheadBehind ahead={branch.ahead} behind={branch.behind} />
        {branch.upstreamGone && <Tag color="warning">gone</Tag>}
      </button>
      <Dropdown menu={{ items: menuItems }} trigger={['click']}>
        <Button
          className={styles.menu}
          type="text"
          size="small"
          icon={<MoreOutlined />}
          aria-label={`Actions for ${branch.name}`}
        />
      </Dropdown>
    </li>
  );
}
