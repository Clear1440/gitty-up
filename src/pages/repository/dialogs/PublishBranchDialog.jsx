import { Alert, Flex, Select, Typography } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useRemotes } from '../../../queries/git.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { BranchNameInput } from './BranchNameInput.jsx';

/** Asks before creating the current branch on a remote, and what to call it there. */
export function PublishBranchDialog({ onClose }) {
  const { repository, status, run } = useRepositoryContext();
  const { data } = useRemotes(repository.id);
  // Read once, so the text doesn't change under the dialog as it closes.
  const [{ branch, upstream, upstreamGone }] = useState(status);
  const [upstreamName, setUpstreamName] = useState(branch);
  const [chosenRemote, setChosenRemote] = useState(null);

  const remotes = data?.remotes ?? [];
  const previousRemote = remotes.find((name) => upstream?.startsWith(`${name}/`));
  const remote = chosenRemote ?? previousRemote ?? data?.defaultRemote;
  const hasNoRemote = Boolean(data) && remotes.length === 0;

  return (
    <ActionDialog
      title={`Publish ${branch}?`}
      okText="Publish branch"
      canSubmit={Boolean(remote && upstreamName)}
      onSubmit={() => run('publishBranch', { remote, upstreamName })}
      onClose={onClose}
    >
      {hasNoRemote ? (
        <Alert type="warning" showIcon title="This repository has no remote to push to." />
      ) : (
        <Flex vertical gap={12}>
          <Typography.Text>
            {upstreamGone
              ? `The remote copy of this branch no longer exists. Create it again?`
              : `This branch isn't on a remote yet. Create it there?`}
          </Typography.Text>
          {remotes.length > 1 && (
            <Select
              aria-label="Remote"
              value={remote}
              options={remotes.map((name) => ({ value: name, label: name }))}
              onChange={setChosenRemote}
            />
          )}
          <BranchNameInput
            autoFocus
            aria-label="Upstream branch name"
            placeholder="Upstream branch name"
            prefix={remote ? `${remote}/` : undefined}
            value={upstreamName}
            onChange={setUpstreamName}
          />
        </Flex>
      )}
    </ActionDialog>
  );
}
