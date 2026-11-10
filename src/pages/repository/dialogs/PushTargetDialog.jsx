import { Flex, Radio, Typography } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';

/**
 * Asks where to push a branch that tracks a remote branch belonging to another, as a
 * branch made from origin/main does. Pushing to its own name is offered first.
 * `mismatch` is `{ branch, remote, upstreamName }` from the server, and `input` is
 * what the push was asked with, such as `force`.
 */
export function PushTargetDialog({ mismatch, input = {}, onClose }) {
  const { run } = useRepositoryContext();
  const { branch, remote, upstreamName } = mismatch;
  const ownTarget = `${remote}/${branch}`;
  const trackedTarget = `${remote}/${upstreamName}`;
  const [choice, setChoice] = useState('own');

  const submit = () =>
    choice === 'own'
      ? run('publishBranch', { ...input, remote, upstreamName: branch })
      : run('push', { ...input, toUpstream: true, target: trackedTarget });

  return (
    <ActionDialog
      title={`Where should ${branch} go?`}
      okText={choice === 'own' ? `Push to ${ownTarget}` : `Push into ${trackedTarget}`}
      danger={choice === 'tracked'}
      onSubmit={submit}
      onClose={onClose}
    >
      <Flex vertical gap={12}>
        <Typography.Text>
          {branch} tracks {trackedTarget}, which belongs to {upstreamName}. Pushing would update{' '}
          {trackedTarget} directly, without a branch of its own or a pull request.
        </Typography.Text>
        <Radio.Group
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          options={[
            {
              value: 'own',
              label: `Create ${ownTarget} and track it from now on (recommended)`,
            },
            {
              value: 'tracked',
              label: `Push into ${trackedTarget} anyway${input.force ? ', overwriting it' : ''}`,
            },
          ]}
        />
      </Flex>
    </ActionDialog>
  );
}
