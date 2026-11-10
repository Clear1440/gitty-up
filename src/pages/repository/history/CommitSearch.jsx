import { CloseOutlined, DownOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Input, Tooltip } from 'antd';
import { useEffect, useRef } from 'react';
import styles from './CommitSearch.module.css';

/**
 * The history's search box. Enter goes to the next match and Shift+Enter to the one
 * before, and Escape closes it. `current` is the index of the match on show.
 */
export function CommitSearch({
  query,
  onQueryChange,
  matchCount,
  current,
  onStep,
  onClose,
  focusRequest,
  canSearchOlder,
  isSearchingOlder,
  onSearchOlder,
}) {
  const inputRef = useRef(null);

  // Ctrl+F again while open puts the cursor back here, with the query ready to retype.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onStep(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const hasQuery = query.trim() !== '';
  const count = !hasQuery
    ? null
    : matchCount === 0
      ? 'No matches'
      : `${current + 1} of ${matchCount}`;

  return (
    <div className={styles.search} role="search">
      <Input
        ref={inputRef}
        size="small"
        className={styles.input}
        prefix={<SearchOutlined />}
        placeholder="Search commits"
        aria-label="Search commits"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
        suffix={count && <span className={styles.count}>{count}</span>}
      />
      <Tooltip title="Previous match (Shift+Enter)">
        <Button
          size="small"
          type="text"
          icon={<UpOutlined />}
          aria-label="Previous match"
          disabled={matchCount === 0}
          onClick={() => onStep(-1)}
        />
      </Tooltip>
      <Tooltip title="Next match (Enter)">
        <Button
          size="small"
          type="text"
          icon={<DownOutlined />}
          aria-label="Next match"
          disabled={matchCount === 0}
          onClick={() => onStep(1)}
        />
      </Tooltip>
      {hasQuery && canSearchOlder && (
        <Tooltip title="Only the commits loaded so far are searched">
          <Button size="small" loading={isSearchingOlder} onClick={onSearchOlder}>
            Load older
          </Button>
        </Tooltip>
      )}
      <Tooltip title="Close (Esc)">
        <Button
          size="small"
          type="text"
          icon={<CloseOutlined />}
          aria-label="Close search"
          onClick={onClose}
        />
      </Tooltip>
    </div>
  );
}
