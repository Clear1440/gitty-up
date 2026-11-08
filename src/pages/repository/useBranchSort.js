import { useStoredState } from '../../utils/useStoredState.js';
import { BRANCH_SORTS, DEFAULT_BRANCH_SORT } from './branchTree.js';

const STORAGE_KEY = 'gitty-up.branch-sort';

const isKnownSort = (value) => BRANCH_SORTS.some((sort) => sort.value === value);

/** How branches are sorted. One setting for the whole app, not one per repository. */
export function useBranchSort() {
  return useStoredState(STORAGE_KEY, DEFAULT_BRANCH_SORT, { isValid: isKnownSort });
}
