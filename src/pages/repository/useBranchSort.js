import { useState } from 'react';
import { readStored, writeStored } from '../../utils/storage.js';
import { BRANCH_SORTS, DEFAULT_BRANCH_SORT } from './branchTree.js';

const STORAGE_KEY = 'gitty-up.branch-sort';

function readSort() {
  const stored = readStored(STORAGE_KEY, DEFAULT_BRANCH_SORT);
  return BRANCH_SORTS.some(({ value }) => value === stored) ? stored : DEFAULT_BRANCH_SORT;
}

/** How branches are sorted. One setting for the whole app, not one per repository. */
export function useBranchSort() {
  const [sort, setSort] = useState(readSort);

  const changeSort = (nextSort) => {
    setSort(nextSort);
    writeStored(STORAGE_KEY, nextSort);
  };

  return [sort, changeSort];
}
