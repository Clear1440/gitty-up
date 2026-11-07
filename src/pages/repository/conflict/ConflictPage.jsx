import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Button, Result, Space, Spin } from 'antd';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { paths } from '../../../paths.js';
import { useConflict } from '../../../queries/git.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { ConflictEditor } from './ConflictEditor.jsx';
import styles from './ConflictPage.module.css';

function BackToChanges({ repositoryId, children = 'Back to changes' }) {
  return (
    <Link to={paths.uncommitted(repositoryId)}>
      <Button icon={<ArrowLeftOutlined />}>{children}</Button>
    </Link>
  );
}

/** A binary file can't be merged line by line, so one side has to win outright. */
function BinaryConflict({ conflict, onResolve, isBusy }) {
  const { repository } = useRepositoryContext();
  return (
    <Result
      status="warning"
      title={`${conflict.path} is a binary file`}
      subTitle="It can't be merged line by line. Keep one side's version of it."
      extra={
        <Space wrap>
          <BackToChanges repositoryId={repository.id}>Cancel</BackToChanges>
          {conflict.ours !== null && (
            <Button disabled={isBusy} onClick={() => onResolve({ side: 'ours' })}>
              Keep {conflict.labels.ours}&apos;s version
            </Button>
          )}
          {conflict.theirs !== null && (
            <Button disabled={isBusy} onClick={() => onResolve({ side: 'theirs' })}>
              Keep {conflict.labels.theirs}&apos;s version
            </Button>
          )}
        </Space>
      }
    />
  );
}

/** The three-way editor for one conflicted file, at `?path=`. */
export function ConflictPage() {
  const { repository, run, isBusy } = useRepositoryContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const path = searchParams.get('path') ?? '';
  const { data: conflict, error, isPending } = useConflict(repository.id, path);

  const resolve = async (input) => {
    if (await run('resolveConflict', { path, ...input })) {
      navigate(paths.uncommitted(repository.id));
    }
  };

  if (isPending) return <Spin className="centered" size="large" />;
  if (error) {
    return (
      <Result
        status="info"
        title="Nothing to resolve here"
        subTitle={error.message}
        extra={<BackToChanges repositoryId={repository.id} />}
      />
    );
  }
  if (conflict.binary) {
    return <BinaryConflict conflict={conflict} onResolve={resolve} isBusy={isBusy} />;
  }

  const deletedBy = [
    conflict.ours === null && conflict.labels.ours,
    conflict.theirs === null && conflict.labels.theirs,
  ].filter(Boolean);

  return (
    <div className={styles.page}>
      {deletedBy.length > 0 && (
        <Alert
          banner
          type="info"
          title={`${deletedBy.join(' and ')} deleted this file. Keep it by saving the merged version, or delete it.`}
          action={
            <Button size="small" danger disabled={isBusy} onClick={() => resolve({ remove: true })}>
              Delete the file
            </Button>
          }
        />
      )}
      {/* The key starts afresh should another file's conflict open in this page. */}
      <ConflictEditor
        key={path}
        conflict={conflict}
        isBusy={isBusy}
        onSave={(content) => resolve({ content })}
        onCancel={() => navigate(paths.uncommitted(repository.id))}
      />
    </div>
  );
}
