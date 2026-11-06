import { Input } from 'antd';
import { useLayoutEffect, useRef, useState } from 'react';
import { formatBranchName } from './formatBranchName.js';

/** A text field that tidies a branch name as it is typed. `onChange` gets the name. */
export function BranchNameInput({ onChange, ...inputProps }) {
  const inputRef = useRef(null);
  const [edit, setEdit] = useState(null);

  const handleChange = ({ target }) => {
    onChange(formatBranchName(target.value));
    setEdit({ caret: formatBranchName(target.value.slice(0, target.selectionStart)).length });
  };

  // Rewriting a field's value sends the caret to the end, even mid-word. Each change
  // makes a new object, so this also runs for a keystroke that was refused, but not
  // for other renders, which would pull the caret back from wherever it has moved to.
  useLayoutEffect(() => {
    if (edit) inputRef.current?.input.setSelectionRange(edit.caret, edit.caret);
  }, [edit]);

  return <Input ref={inputRef} onChange={handleChange} {...inputProps} />;
}
