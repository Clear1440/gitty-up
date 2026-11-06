import { DiffOutlined, HistoryOutlined } from '@ant-design/icons';
import { Button, Result, Segmented, Spin } from 'antd';
import { useMemo, useRef, useState } from 'react';
import { Link, Outlet, useMatch, useNavigate, useParams } from 'react-router';
import { paths } from '../../paths.js';
import { useStatus } from '../../queries/git.js';
import { useRepository } from '../../queries/repositories.js';
import { useGitActions } from '../../queries/useGitActions.js';
import { ActionBar } from './ActionBar.jsx';
import { BranchSidebar } from './BranchSidebar.jsx';
import { CommitPanel } from './CommitPanel.jsx';
import { RepositoryDialogs } from './dialogs/RepositoryDialogs.jsx';
import { OperationBanner } from './OperationBanner.jsx';
import { RepositoryContext } from './RepositoryContext.js';
import styles from './RepositoryLayout.module.css';

function BackHome() {
  return (
    <Link to={paths.home()}>
      <Button type="primary">Back to repositories</Button>
    </Link>
  );
}

function ViewSwitcher({ repositoryId, changeCount }) {
  const navigate = useNavigate();
  const onChanges = useMatch('/repositories/:repositoryId/changes');

  const options = [
    { value: 'history', label: 'History', icon: <HistoryOutlined /> },
    {
      value: 'changes',
      label: changeCount > 0 ? `Changes (${changeCount})` : 'Changes',
      icon: <DiffOutlined />,
    },
  ];

  return (
    <Segmented
      className={styles.viewSwitcher}
      options={options}
      value={onChanges ? 'changes' : 'history'}
      onChange={(view) => navigate(paths[view](repositoryId))}
    />
  );
}

function RepositoryWorkspace({ repository }) {
  const { data: status, error } = useStatus(repository.id);
  const actions = useGitActions(repository.id);
  const [dialog, setDialog] = useState(null);
  const commitInputRef = useRef(null);

  const context = useMemo(
    () => ({
      repository,
      status,
      ...actions,
      openDialog: (type, props) => setDialog({ type, props }),
      focusCommitMessage: () => commitInputRef.current?.focus(),
    }),
    [repository, status, actions],
  );

  if (!status) {
    if (error) return <Result status="error" title="Could not read this repository" subTitle={error.message} extra={<BackHome />} />;
    return <Spin className="centered" size="large" />;
  }

  const changeCount = status.staged.length + status.unstaged.length + status.conflicted.length;

  return (
    <RepositoryContext value={context}>
      <div className={styles.workspace}>
        <ActionBar />
        <OperationBanner />
        <div className={styles.body}>
          <BranchSidebar />
          <section className={styles.main}>
            <ViewSwitcher repositoryId={repository.id} changeCount={changeCount} />
            <Outlet />
          </section>
        </div>
        <CommitPanel inputRef={commitInputRef} />
      </div>
      <RepositoryDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </RepositoryContext>
  );
}

export function RepositoryLayout() {
  const { repositoryId } = useParams();
  const { data: repository, error, isPending } = useRepository(repositoryId);

  if (isPending) return <Spin className="centered" size="large" />;
  if (error) {
    return <Result status="warning" title="Repository unavailable" subTitle={error.message} extra={<BackHome />} />;
  }
  if (!repository.available) {
    return (
      <Result
        status="warning"
        title="Folder not found"
        subTitle={`${repository.path} was moved or deleted.`}
        extra={<BackHome />}
      />
    );
  }

  // The key resets per-repository state, such as an open dialog, when switching tabs.
  return <RepositoryWorkspace key={repository.id} repository={repository} />;
}
