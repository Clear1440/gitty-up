import { Checkbox, Flex, Input } from 'antd';
import { useLayoutEffect, useRef, useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';
import { BranchSelect } from './BranchSelect.jsx';
import { formatBranchName } from './formatBranchName.js';

export function CreateBranchDialog({ startPoint: initialStartPoint, onClose }) {
  const { status, run } = useRepositoryContext();
  const [field, setField] = useState({ name: '', caret: 0 });
  const { name } = field;
  const [startPoint, setStartPoint] = useState(initialStartPoint ?? status.branch ?? undefined);
  const [switchTo, setSwitchTo] = useState(true);
  const inputRef = useRef(null);

  const handleNameChange = ({ target }) => {
    setField({
      name: formatBranchName(target.value),
      caret: formatBranchName(target.value.slice(0, target.selectionStart)).length,
    });
  };

  // Rewriting a field's value sends the caret to the end, even mid-word. Each change
  // makes a new object, so this also runs for a keystroke that was refused, but not
  // for other renders, which would pull the caret back from wherever it has moved to.
  useLayoutEffect(() => {
    inputRef.current?.input.setSelectionRange(field.caret, field.caret);
  }, [field]);

  return (
    <ActionDialog
      title="Create a branch"
      okText="Create branch"
      canSubmit={Boolean(name)}
      onSubmit={() => run('createBranch', { name, startPoint, switchTo })}
      onClose={onClose}
    >
      <Flex vertical gap={12}>
        <Input
          ref={inputRef}
          autoFocus
          aria-label="Branch name"
          placeholder="Branch name"
          value={name}
          onChange={handleNameChange}
        />
        <BranchSelect
          aria-label="Start from"
          placeholder="Start from HEAD"
          value={startPoint}
          onChange={setStartPoint}
        />
        <Checkbox checked={switchTo} onChange={(event) => setSwitchTo(event.target.checked)}>
          Switch to the new branch
        </Checkbox>
      </Flex>
    </ActionDialog>
  );
}
