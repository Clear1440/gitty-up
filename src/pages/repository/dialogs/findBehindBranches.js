import { TextHelper } from '../../../utils/TextHelper.js';

/** Says which of `names` are behind their remote, for the server's check before a merge. */
export function findBehindBranches(localBranches, names) {
  return localBranches
    .filter(({ name, behind }) => names.includes(name) && behind > 0)
    .map(({ name, behind, upstream }) => {
      return `${name} is ${TextHelper.countOf(behind, 'commit')} behind ${upstream}.`;
    });
}
