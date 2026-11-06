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
import { useBranchMenu } from './useBranchMenu.js';
import styles from './BranchRow.module.css';

function BranchIcon({ branch, kind }) {
  if (branch.isCurrent) return <CheckCircleFilled className={styles.iconCurrent} />;
  return kind === 'remote' ? <CloudOutlined /> : <LaptopOutlined />;
}

export function BranchRow({ branch, label, kind, depth, selected }) {
  const navigate = useNavigate();
  const { repository } = useRepositoryContext();
  const { items, checkout } = useBranchMenu(branch, kind);

  // The time makes every click a new request, so a branch scrolled away from can be found again.
  const focus = () => {
    navigate(paths.focusBranch(repository.id, branch.name), {
      state: { focusBranch: Date.now() },
    });
  };

  const menu = { items };

  return (
    <Dropdown menu={menu} trigger={['contextMenu']}>
      <li className={clsx(styles.row, selected && styles.selected)}>
        <button
          type="button"
          className={styles.button}
          style={{ '--branch-depth': depth }}
          title={branch.isCurrent ? branch.name : `${branch.name}\nDouble-click to check out`}
          onClick={focus}
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
