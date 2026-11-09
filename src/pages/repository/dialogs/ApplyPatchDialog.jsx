import { Alert, Flex, Radio } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { TextHelper } from '../../../utils/TextHelper.js';
import { PatchHelper } from '../patches.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { StatusHelper } from '../StatusHelper.js';

/** Asks how to apply a patch that was picked or dropped onto the window. */
export function ApplyPatchDialog({ name, patch, onClose }) {
  const { status, run, isBusy } = useRepositoryContext();
  const canCommit = PatchHelper.isMailbox(patch);
  const [mode, setMode] = useState(canCommit ? 'commit' : 'changes');
  const fileCount = PatchHelper.countFiles(patch);
  const commitCount = PatchHelper.countCommits(patch);
  const blocked = StatusHelper.isBlocked(status, isBusy);

  return (
    <ActionDialog
      title={`Apply ${name}`}
      okText="Apply"
      canSubmit={!blocked}
      onSubmit={() => run('applyPatch', { patch, mode, name })}
      onClose={onClose}
    >
      <Flex vertical gap={12}>
        <p style={{ margin: 0 }}>
          Changes {TextHelper.countOf(fileCount, 'file')}
          {canCommit && ` in ${TextHelper.countOf(commitCount, 'commit')}`}.
        </p>
        {canCommit && (
          <Radio.Group
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            options={[
              {
                value: 'commit',
                label: `Commit to ${StatusHelper.currentBranchName(status)}, keeping the author and message`,
              },
              { value: 'changes', label: 'Only change the files, to review and commit myself' },
            ]}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          />
        )}
        {status.operation && (
          <Alert type="warning" showIcon title={`Finish the ${status.operation} first.`} />
        )}
      </Flex>
    </ActionDialog>
  );
}
