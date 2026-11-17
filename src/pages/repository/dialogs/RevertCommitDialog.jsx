import { Checkbox, Flex } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { Outcome } from '../../../components/Field.jsx';
import { paths } from '../../../paths.js';
import { StatusHelper } from '../StatusHelper.js';
import { useRepositoryContext } from '../RepositoryContext.js';

/**
 * Adds a commit that undoes another. Keeping the message commits straight away as
 * `Revert "<subject>"`. Otherwise the undoing changes are staged, and the commit box
 * opens for a message of the user's own.
 */
export function RevertCommitDialog({ hash, shortHash, subject, onClose }) {
  const { repository, status, run } = useRepositoryContext();
  const navigate = useNavigate();
  const [keepMessage, setKeepMessage] = useState(true);
  const current = StatusHelper.currentBranchName(status);

  const submit = async () => {
    const finished = await run('revert', { hash, shortHash, keepMessage });
    if (finished && !keepMessage) {
      navigate(paths.uncommitted(repository.id), { state: { focusCommitMessage: Date.now() } });
    }
    return finished;
  };

  return (
    <ActionDialog title={`Revert ${shortHash}`} okText="Revert" onSubmit={submit} onClose={onClose}>
      <Flex vertical gap={12}>
        <Checkbox
          autoFocus
          checked={keepMessage}
          onChange={(event) => setKeepMessage(event.target.checked)}
        >
          Keep the commit message
        </Checkbox>
        <Outcome>
          {keepMessage ? (
            <>
              Adds a commit to <strong>{current}</strong> that undoes this one, named{' '}
              <strong>Revert &ldquo;{subject}&rdquo;</strong>.
            </>
          ) : (
            <>
              Stages the changes that undo this commit on <strong>{current}</strong>. Commit them
              from Uncommitted changes with a message of your own.
            </>
          )}
        </Outcome>
      </Flex>
    </ActionDialog>
  );
}
