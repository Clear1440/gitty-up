import { useRepositoryContext } from './RepositoryContext.js';
import { StatusHelper } from './StatusHelper.js';

/** @deprecated Use StatusHelper.needsPublishing. */
export const needsPublishing = StatusHelper.needsPublishing;

/** Pushes the current branch, first asking where to publish it if it isn't on a remote. */
export function usePush() {
  const { status, run, openDialog } = useRepositoryContext();

  return (input) => {
    if (StatusHelper.needsPublishing(status)) openDialog('publishBranch');
    else return run('push', input);
  };
}
