import {
  BranchesOutlined,
  CloudDownloadOutlined,
  DisconnectOutlined,
  EditOutlined,
  FolderOpenOutlined,
  MoreOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { App, Button, Dropdown } from 'antd';
import clsx from 'clsx';
import { useState } from 'react';
import { Link } from 'react-router';
import { AheadBehind } from '../../components/AheadBehind.jsx';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { paths } from '../../paths.js';
import { useUnlinkRepository } from '../../queries/repositories.js';
import { useTabs } from '../../tabs/TabsContext.jsx';
import styles from './RepositoryCard.module.css';
import { CloneRepositoryDialog, LocateRepositoryDialog } from './StubDialogs.jsx';

function Identity({ repository }) {
  const location = repository.path ?? repository.remoteUrl;
  return (
    <div className={styles.identity}>
      <h2 className={styles.title}>{repository.name}</h2>
      <p className={styles.path} title={location}>
        {location}
      </p>
    </div>
  );
}

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

/** A repository known only by its URL. It has no folder to open until one is chosen. */
function StubBody({ repository }) {
  const [dialog, setDialog] = useState(null);
  const closeDialog = () => setDialog(null);

  return (
    <div className={styles.body}>
      <Identity repository={repository} />
      <div className={styles.stubActions}>
        <Button
          type="primary"
          size="small"
          icon={<CloudDownloadOutlined />}
          onClick={() => setDialog('clone')}
        >
          Clone repository
        </Button>
        <Button size="small" icon={<FolderOpenOutlined />} onClick={() => setDialog('locate')}>
          Locate in file system
        </Button>
      </div>
      {dialog === 'clone' && (
        <CloneRepositoryDialog repository={repository} onClose={closeDialog} />
      )}
      {dialog === 'locate' && (
        <LocateRepositoryDialog repository={repository} onClose={closeDialog} />
      )}
    </div>
  );
}

export function RepositoryCard({ repository, view = 'card' }) {
  const { modal, notification } = App.useApp();
  const unlink = useUnlinkRepository();
  const { closeTab } = useTabs();
  const isStub = repository.path === null;

  const confirmUnlink = () => {
    modal.confirm({
      title: `Unlink ${repository.name}?`,
      content: isStub
        ? 'It leaves this list. Nothing on the remote changes.'
        : 'It leaves this list. The folder and its files stay on disk.',
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
    <article
      className={clsx(
        styles.card,
        view === 'list' && styles.row,
        !repository.available && styles.unavailable,
      )}
    >
      {isStub ? (
        <StubBody repository={repository} />
      ) : (
        <Link className={clsx(styles.body, styles.link)} to={paths.repository(repository.id)}>
          <Identity repository={repository} />
          {repository.available ? (
            <CardStatus summary={repository.summary} />
          ) : (
            <p className={styles.missing}>
              <WarningOutlined /> Folder not found
            </p>
          )}
        </Link>
      )}
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
