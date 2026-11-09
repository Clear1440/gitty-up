import { useQueryClient } from '@tanstack/react-query';
import { Button, Result, Spin } from 'antd';
import clsx from 'clsx';
import { use, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useMatch, useParams, useSearchParams } from 'react-router';
import { ResizeHandle } from '../../components/ResizeHandle.jsx';
import { useResizableSizes } from '../../components/useResizableSizes.js';
import { paths } from '../../paths.js';
import { useStatus } from '../../queries/git.js';
import { loadRepository } from '../../queries/loadRepository.js';
import { useRepository } from '../../queries/repositories.js';
import { useGitActions } from '../../queries/useGitActions.js';
import { ActionBar } from './ActionBar.jsx';
import { BranchSidebar } from './BranchSidebar.jsx';
import { RepositoryDialogs } from './dialogs/RepositoryDialogs.jsx';
import { OperationBanner } from './OperationBanner.jsx';
import { PatchDropZone } from './PatchDropZone.jsx';
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
  const resolving = Boolean(useMatch('/repositories/:repositoryId/resolve'));
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
    if (!error) return <Spin className="centered" size="large" />;
    return (
      <Result
        status="error"
        title="Could not read this repository"
        subTitle={error.message}
        extra={<BackHome />}
      />
    );
  }

  return (
    <RepositoryContext value={context}>
      <PatchDropZone>
        <div className={styles.workspace}>
          <ActionBar />
          <OperationBanner />
          <div
            ref={bodyRef}
            className={clsx(styles.body, resolving && styles.fullWidth)}
            style={bodyStyle}
          >
            {/* Resolving a conflict needs the width for its three panes. */}
            {!resolving && (
              <BranchSidebar
                resizeHandle={<ResizeHandle label="Resize branches" {...handleFor('sidebar')} />}
              />
            )}
            <section className={styles.main}>
              <Outlet />
            </section>
          </div>
        </div>
      </PatchDropZone>
      <RepositoryDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </RepositoryContext>
  );
}

export function RepositoryLayout() {
  const { repositoryId } = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  // Waiting here, rather than in each panel, keeps the previous page on screen until
  // this one can show everything at once, instead of a spinner for every panel.
  use(loadRepository(queryClient, repositoryId, searchParams.get('ref') ?? undefined));

  const { data: repository, error, isPending } = useRepository(repositoryId);

  if (isPending) return <Spin className="centered" size="large" />;
  if (error) {
    return (
      <Result
        status="warning"
        title="Repository unavailable"
        subTitle={error.message}
        extra={<BackHome />}
      />
    );
  }
  if (repository.isMono && !repository.available) {
    return (
      <Result
        status="info"
        title={`Nothing in ${repository.name} is on ${repository.branch} any more`}
        subTitle="Every repository in this group has moved to another branch. Open the group again to pick one."
        extra={<BackHome />}
      />
    );
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
