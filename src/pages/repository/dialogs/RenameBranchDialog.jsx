import { Checkbox, Flex } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { Field, Outcome } from '../../../components/Field.jsx';
import { BranchHelper } from '../../../utils/BranchHelper.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { BranchNameInput } from './BranchNameInput.jsx';

/** origin/topic, with the branch's new name in place of its name on the remote. */
const renamedUpstream = (upstream, newName) => {
  const slash = upstream.indexOf('/');
  return slash < 0 ? newName : `${upstream.slice(0, slash)}/${newName}`;
};

function UpstreamOutcome({ upstream, newName, renameRemote, isMono }) {
  if (!upstream) return null;
  if (!renameRemote) {
    return (
      <>
        {' '}
        It still pushes to and pulls from <strong>{upstream}</strong>, which keeps its name.
      </>
    );
  }
  if (isMono) {
    return ' Each repository’s branch on its remote is renamed to match, for everyone using it.';
  }
  return (
    <>
      {' '}
      <strong>{upstream}</strong> becomes <strong>{renamedUpstream(upstream, newName)}</strong>{' '}
      for everyone using it, and the branch pushes to and pulls from that.
    </>
  );
}

/**
 * Renames a local branch, keeping its commits. In a mono repo it renames the branch in
 * every repository of the group that has it, so the names stay together. `upstream` is
 * the branch it tracks, if that is still on the remote, which can be renamed along with it.
 */
export function RenameBranchDialog({ name, upstream, onClose }) {
  const { repository, run } = useRepositoryContext();
  const [newName, setNewName] = useState(name);
  const [renameRemote, setRenameRemote] = useState(false);
  const changed = Boolean(newName) && newName !== name;
  const canRenameRemote = Boolean(upstream) && !BranchHelper.isProtectedUpstream(upstream);
  const withRemote = canRenameRemote && renameRemote;

  return (
    <ActionDialog
      title={`Rename ${name}`}
      okText="Rename"
      canSubmit={changed}
      onSubmit={() => run('renameBranch', { name, newName, renameRemote: withRemote })}
      onClose={onClose}
    >
      <Flex vertical gap={12}>
        <Field label="New name">
          <BranchNameInput
            autoFocus
            aria-label="New branch name"
            value={newName}
            onChange={setNewName}
            onFocus={(event) => event.target.select()}
          />
        </Field>
        {canRenameRemote && (
          <Checkbox
            checked={renameRemote}
            onChange={(event) => setRenameRemote(event.target.checked)}
          >
            {/* Each repository tracks its own remote, which may not share this name. */}
            {repository.isMono
              ? 'Also rename it on each repository’s remote'
              : `Also rename ${upstream} on the remote`}
          </Checkbox>
        )}
        {changed && (
          <Outcome>
            Renames <strong>{name}</strong> to <strong>{newName}</strong>
            {repository.isMono ? ' in every repository here that has it' : ''}, keeping its
            commits.
            <UpstreamOutcome
              upstream={upstream}
              newName={newName}
              renameRemote={withRemote}
              isMono={repository.isMono}
            />
          </Outcome>
        )}
      </Flex>
    </ActionDialog>
  );
}
