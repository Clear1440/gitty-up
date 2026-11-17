import { Alert, Checkbox, Flex, Input, Segmented } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { Field } from '../../../components/Field.jsx';
import { useBranches, useWorktrees } from '../../../queries/git.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { useWorktreeActions } from '../useWorktreeActions.jsx';
import { localNameOf, suggestWorktreeFolder } from '../worktrees.js';
import { BranchNameInput } from './BranchNameInput.jsx';
import { BranchSelect } from './BranchSelect.jsx';

const MODES = [
  { label: 'Existing branch', value: 'existing' },
  { label: 'New branch', value: 'new' },
];

/**
 * Adds a working tree: another folder with its own checkout of the repository, so a
 * second branch can be worked on without switching this one. `branch` preselects a
 * branch to check out, and `startPoint` a branch to start a new one from.
 */
export function CreateWorktreeDialog({ branch: initialBranch, startPoint, onClose }) {
  const { repository, status, run } = useRepositoryContext();
  const { data: branches } = useBranches(repository.id);
  const { data: worktrees = [] } = useWorktrees(repository.id);
  const { open } = useWorktreeActions();
  const [mode, setMode] = useState(startPoint ? 'new' : 'existing');
  const [branch, setBranch] = useState(initialBranch);
  const [newBranch, setNewBranch] = useState('');
  const [base, setBase] = useState(startPoint ?? status.branch ?? undefined);
  const [folder, setFolder] = useState(null);
  const [openAfter, setOpenAfter] = useState(true);

  const isNew = mode === 'new';
  const mainPath = worktrees.find((worktree) => worktree.isMain)?.path ?? repository.path;
  const branchName = isNew ? newBranch : branch && localNameOf(branch, branches?.remote);
  // Follows the branch until a folder is typed, after which it stays as typed.
  const target = folder ?? suggestWorktreeFolder(mainPath, branchName);

  // Git checks a branch out in one working tree at a time.
  const local = branches?.local.find((candidate) => candidate.name === branchName);
  const takenBy = !isNew && local?.worktreePath ? local.worktreePath : null;

  const submit = async () => {
    const created = await run('addWorktree', {
      path: target,
      ...(isNew ? { newBranch, startPoint: base } : { branch }),
    });
    if (created && openAfter) await open(target);
    return created;
  };

  return (
    <ActionDialog
      title="New worktree"
      okText="Create worktree"
      canSubmit={Boolean(target.trim()) && (isNew ? Boolean(newBranch) : Boolean(branch)) && !takenBy}
      onSubmit={submit}
      onClose={onClose}
    >
      <Flex vertical gap={12}>
        <p style={{ margin: 0 }}>
          A worktree is another folder with its own checkout of this repository, sharing its
          history, so you can work on two branches at once.
        </p>
        <Segmented options={MODES} value={mode} onChange={setMode} />
        {isNew ? (
          <>
            <Field label="New branch name">
              <BranchNameInput
                autoFocus
                aria-label="New branch name"
                placeholder="feature/my-change"
                value={newBranch}
                onChange={setNewBranch}
              />
            </Field>
            <Field label="Start from">
              <BranchSelect
                aria-label="Start from"
                placeholder="The current commit"
                value={base}
                onChange={setBase}
              />
            </Field>
          </>
        ) : (
          <Field label="Branch to check out in the new folder">
            <BranchSelect
              autoFocus
              aria-label="Branch to check out"
              excludeCurrent
              value={branch}
              onChange={setBranch}
            />
          </Field>
        )}
        {takenBy && (
          <Alert
            type="warning"
            showIcon
            title={`${branchName} is already checked out in ${takenBy}.`}
          />
        )}
        <Field label="Folder" hint="Where the worktree is made. It must not exist yet, or be empty.">
          <Input
            aria-label="Folder"
            value={target}
            onChange={(event) => setFolder(event.target.value)}
            placeholder="Full path of a new, empty folder"
          />
        </Field>
        <Checkbox checked={openAfter} onChange={(event) => setOpenAfter(event.target.checked)}>
          Open it in a new tab
        </Checkbox>
      </Flex>
    </ActionDialog>
  );
}
