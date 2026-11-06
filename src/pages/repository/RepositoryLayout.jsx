import { Button, Result, Spin } from 'antd';
import { useMemo, useRef, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router';
import { ResizeHandle } from '../../components/ResizeHandle.jsx';
import { useResizableSizes } from '../../components/useResizableSizes.js';
import { paths } from '../../paths.js';
import { useStatus } from '../../queries/git.js';
import { useRepository } from '../../queries/repositories.js';
import { useGitActions } from '../../queries/useGitActions.js';
import { ActionBar } from './ActionBar.jsx';
import { BranchSidebar } from './BranchSidebar.jsx';
import { RepositoryDialogs } from './dialogs/RepositoryDialogs.jsx';
import { OperationBanner } from './OperationBanner.jsx';
import { RepositoryContext } from './RepositoryContext.js';
import styles from './RepositoryLayout.module.css';

const WORKSPACE_LIMITS = { sidebar: { min: 200, max: 640 } };

function BackHome() {
  return (
    <Link to={paths.home()}>
      <Button type="primary">Back to repositories</Button>
    </Link>
  );
}

function RepositoryWorkspace({ repository }) {
  const { data: status, error } = useStatus(repository.id);
  const actions = useGitActions(repository.id);
  const [dialog, setDialog] = useState(null);
  const bodyRef = useRef(null);
  const { style: bodyStyle, handleFor } = useResizableSizes(bodyRef, 'workspace', WORKSPACE_LIMITS);

  const context = useMemo(
    () => ({
      repository,
      status,
      ...actions,
      openDialog: (type, props) => setDialog({ type, props }),
    }),
    [repository, status, actions],
  );

  if (!status) {
    if (error) return <Result status="error" title="Could not read this repository" subTitle={error.message} extra={<BackHome />} />;
    return <Spin className="centered" size="large" />;
  }

  return (
    <RepositoryContext value={context}>
      <div className={styles.workspace}>
        <ActionBar />
        <OperationBanner />
        <div ref={bodyRef} className={styles.body} style={bodyStyle}>
          <BranchSidebar
            resizeHandle={<ResizeHandle label="Resize branches" {...handleFor('sidebar')} />}
          />
          <section className={styles.main}>
            <Outlet />
          </section>
        </div>
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
