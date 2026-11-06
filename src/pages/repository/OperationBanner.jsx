import { Alert, Button, Popconfirm, Space } from 'antd';
import { useRepositoryContext } from './RepositoryContext.js';

const LABELS = { merge: 'Merge', rebase: 'Rebase' };

/** Appears while a merge or rebase is paused and waiting on the user. */
export function OperationBanner() {
  const { status, run, isBusy } = useRepositoryContext();
  if (!status.operation) return null;

  const label = LABELS[status.operation];
  const conflictCount = status.conflicted.length;
  const title =
    conflictCount > 0
      ? `${label} in progress: ${conflictCount} conflicted ${conflictCount === 1 ? 'file' : 'files'}. Fix them, then mark them resolved under Changes.`
      : `${label} in progress: all conflicts resolved.`;

  return (
    <Alert
      banner
      type="warning"
      title={title}
      action={
        <Space>
          <Button
            size="small"
            type="primary"
            disabled={isBusy || conflictCount > 0}
            onClick={() => run('continueOperation')}
          >
            {status.operation === 'merge' ? 'Finish merge' : 'Continue rebase'}
          </Button>
          <Popconfirm
            title={`Abort this ${status.operation}?`}
            description="Your branch returns to how it was before it started."
            okText="Abort"
            okButtonProps={{ danger: true }}
            onConfirm={() => run('abortOperation')}
          >
            <Button size="small" disabled={isBusy}>
              Abort
            </Button>
          </Popconfirm>
        </Space>
      }
    />
  );
}
