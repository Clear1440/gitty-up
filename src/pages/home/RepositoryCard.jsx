import {
  BranchesOutlined,
  DisconnectOutlined,
  EditOutlined,
  MoreOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { App, Button, Dropdown } from 'antd';
import clsx from 'clsx';
import { Link } from 'react-router';
import { AheadBehind } from '../../components/AheadBehind.jsx';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { paths } from '../../paths.js';
import { useUnlinkRepository } from '../../queries/repositories.js';
import { useTabs } from '../../tabs/TabsContext.jsx';
import styles from './RepositoryCard.module.css';

function BranchLabel({ summary }) {
  return (
    <span className={styles.branch}>
      <BranchesOutlined /> {summary.detached ? 'detached HEAD' : summary.branch}
    </span>
  );
}

function CardStatus({ summary }) {
  return (
    <>
      <div className={styles.meta}>
        <BranchLabel summary={summary} />
        <AheadBehind ahead={summary.ahead} behind={summary.behind} />
        {summary.changeCount > 0 && (
          <span className={styles.changes}>
            <EditOutlined /> {summary.changeCount}
          </span>
        )}
      </div>
      {summary.lastCommit ? (
        <p className={styles.lastCommit}>
          <span className={styles.commitSubject}>{summary.lastCommit.subject}</span>
          <RelativeTime className={styles.commitTime} date={summary.lastCommit.date} />
        </p>
      ) : (
        <p className={styles.lastCommit}>No commits yet</p>
      )}
    </>
  );
}

export function RepositoryCard({ repository }) {
  const { modal, notification } = App.useApp();
  const unlink = useUnlinkRepository();
  const { closeTab } = useTabs();

  const confirmUnlink = () => {
    modal.confirm({
      title: `Unlink ${repository.name}?`,
      content: 'It leaves this list. The folder and its files stay on disk.',
      okText: 'Unlink',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await unlink.mutateAsync(repository.id);
          closeTab(repository.id);
        } catch (error) {
          notification.error({ title: 'Unlink failed', description: error.message });
        }
      },
    });
  };

  const menuItems = [
    { key: 'unlink', label: 'Unlink', icon: <DisconnectOutlined />, onClick: confirmUnlink },
  ];

  return (
    <article className={clsx(styles.card, !repository.available && styles.unavailable)}>
      <Link className={styles.link} to={paths.repository(repository.id)}>
        <h2 className={styles.title}>{repository.name}</h2>
        <p className={styles.path} title={repository.path}>
          {repository.path}
        </p>
        {repository.available ? (
          <CardStatus summary={repository.summary} />
        ) : (
          <p className={styles.missing}>
            <WarningOutlined /> Folder not found
          </p>
        )}
      </Link>
      <Dropdown menu={{ items: menuItems }} trigger={['click']}>
        <Button
          className={styles.menu}
          type="text"
          icon={<MoreOutlined />}
          aria-label={`Options for ${repository.name}`}
        />
      </Dropdown>
    </article>
  );
}
