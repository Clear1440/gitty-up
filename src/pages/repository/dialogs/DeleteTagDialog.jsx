import { Checkbox, Flex, Typography } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { Outcome } from '../../../components/Field.jsx';
import { useTagRemotes } from '../../../queries/git.js';
import { TextHelper } from '../../../utils/TextHelper.js';
import { useRepositoryContext } from '../RepositoryContext.js';

/**
 * Deletes a tag here. When a remote has it too, asks whether to delete it there as well,
 * which affects everyone using it, so it starts unticked.
 */
export function DeleteTagDialog({ name, onClose }) {
  const { repository, run } = useRepositoryContext();
  const { data: remotesWithTag = [], isPending } = useTagRemotes(repository.id, name);
  const [deleteRemote, setDeleteRemote] = useState(false);
  const remoteNames = TextHelper.joinWithAnd(remotesWithTag);
  const deletingRemote = deleteRemote && remotesWithTag.length > 0;

  return (
    <ActionDialog
      title={`Delete ${name}?`}
      okText="Delete tag"
      danger
      onSubmit={() =>
        run('deleteTag', { name, remotes: deletingRemote ? remotesWithTag : undefined })
      }
      onClose={onClose}
    >
      <Flex vertical gap={12}>
        <Typography.Text>
          This deletes the tag {name} from this repository. The commit it marks stays.
        </Typography.Text>
        {isPending && <Typography.Text type="secondary">Checking the remotes…</Typography.Text>}
        {remotesWithTag.length > 0 && (
          <Checkbox
            checked={deleteRemote}
            onChange={(event) => setDeleteRemote(event.target.checked)}
          >
            Also delete it from {remoteNames}
          </Checkbox>
        )}
        {deletingRemote && (
          <Outcome>
            This removes {name} from {remoteNames} for everyone using it. It cannot be undone.
          </Outcome>
        )}
      </Flex>
    </ActionDialog>
  );
}
