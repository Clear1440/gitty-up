import { Checkbox, Flex } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { Field, Outcome } from '../../../components/Field.jsx';
import { CommitHelper } from '../CommitHelper.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { BranchNameInput } from './BranchNameInput.jsx';
import { BranchSelect } from './BranchSelect.jsx';

/** `commit` starts the branch from a commit rather than a branch. */
export function CreateBranchDialog({ startPoint: initialStartPoint, commit, onClose }) {
  const { status, run } = useRepositoryContext();
  const [name, setName] = useState('');
  const [startPoint, setStartPoint] = useState(
    commit?.hash ?? initialStartPoint ?? status.branch ?? undefined,
  );
  const [switchTo, setSwitchTo] = useState(true);
  const startLabel =
    startPoint === commit?.hash
      ? `commit ${commit.shortHash}`
      : (startPoint ?? `commit ${CommitHelper.shortHash(status.headHash)}`);
  const stayingOn = status.branch ?? 'the current commit';

  return (
    <ActionDialog
      title="Create a branch"
      okText="Create branch"
      canSubmit={Boolean(name)}
      onSubmit={() => run('createBranch', { name, startPoint, switchTo })}
      onClose={onClose}
    >
      <Flex vertical gap={12}>
        <Field label="Branch name">
          <BranchNameInput
            autoFocus
            aria-label="Branch name"
            placeholder="feature/my-change"
            value={name}
            onChange={setName}
          />
        </Field>
        <Field label="Start from" hint="The new branch starts with the same commits.">
          <BranchSelect
            aria-label="Start from"
            placeholder="The current commit"
            value={startPoint}
            onChange={setStartPoint}
            commit={commit}
          />
        </Field>
        <Checkbox checked={switchTo} onChange={(event) => setSwitchTo(event.target.checked)}>
          Switch to the new branch
        </Checkbox>
        {name && (
          <Outcome>
            Creates <strong>{name}</strong> from <strong>{startLabel}</strong>
            {switchTo ? ' and switches to it.' : `. You stay on ${stayingOn}.`}
          </Outcome>
        )}
      </Flex>
    </ActionDialog>
  );
}
