import { InboxOutlined, MoreOutlined } from '@ant-design/icons';
import { App, Button, Dropdown } from 'antd';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './StashList.module.css';

function StashRow({ stash }) {
  const { status, run, isBusy } = useRepositoryContext();
  const { modal } = App.useApp();
  const blocked = isBusy || Boolean(status.operation);

  const confirmDrop = () => {
    modal.confirm({
      title: 'Drop this stash?',
      content: `"${stash.message}" will be deleted. This cannot be undone.`,
      okText: 'Drop',
      okButtonProps: { danger: true },
      onOk: () => run('stashDrop', { ref: stash.ref }),
    });
  };

  const menuItems = [
    {
      key: 'apply',
      label: 'Apply and keep stash',
      disabled: blocked,
      onClick: () => run('stashApply', { ref: stash.ref }),
    },
    {
      key: 'pop',
      label: 'Pop (apply and remove)',
      disabled: blocked,
      onClick: () => run('stashPop', { ref: stash.ref }),
    },
    { type: 'divider' },
    { key: 'drop', label: 'Drop…', danger: true, disabled: isBusy, onClick: confirmDrop },
  ];

  return (
    <li className={styles.row}>
      <InboxOutlined className={styles.icon} />
      <div className={styles.text} title={stash.message}>
        <p className={styles.message}>{stash.message}</p>
        <p className={styles.meta}>
          {stash.repository && `${stash.repository} · `}
          {stash.branch && `${stash.branch} · `}
          <RelativeTime date={stash.date} />
        </p>
      </div>
      <Dropdown menu={{ items: menuItems }} trigger={['click']}>
        <Button
          className={styles.menu}
          type="text"
          size="small"
          icon={<MoreOutlined />}
          aria-label={`Actions for stash ${stash.message}`}
        />
      </Dropdown>
    </li>
  );
}

export function StashList({ stashes }) {
  if (stashes.length === 0) return <p className={styles.empty}>No stashes</p>;
  return (
    <ul className={styles.list}>
      {stashes.map((stash) => (
        <StashRow key={stash.ref} stash={stash} />
      ))}
    </ul>
  );
}
