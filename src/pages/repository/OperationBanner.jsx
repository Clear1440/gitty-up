import { Alert, Button, Popconfirm, Space } from 'antd';
import { TextHelper } from '../../utils/TextHelper.js';
import { useRepositoryContext } from './RepositoryContext.js';

const LABELS = { merge: 'Merge', rebase: 'Rebase', 'cherry-pick': 'Cherry-pick' };
const CONTINUE_LABELS = {
  merge: 'Finish merge',
  rebase: 'Continue rebase',
  'cherry-pick': 'Finish cherry-pick',
};

/** Appears while a merge, rebase or cherry-pick is paused and waiting on the user. */
export function OperationBanner() {
  const { status, run, isBusy } = useRepositoryContext();
  if (!status.operation) return null;

  const label = LABELS[status.operation];
  const conflictCount = status.conflicted.length;
  const files = TextHelper.pluralize(conflictCount, 'file');
  const conflictedFiles = `${conflictCount} conflicted ${files}`;
  const title =
    conflictCount > 0
      ? `${label} in progress: ${conflictedFiles}. Resolve each one from Uncommitted changes.`
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
            {CONTINUE_LABELS[status.operation]}
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
