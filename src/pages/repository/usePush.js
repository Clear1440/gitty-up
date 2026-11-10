import { useRepositoryContext } from './RepositoryContext.js';
import { StatusHelper } from './StatusHelper.js';

/** @deprecated Use StatusHelper.needsPublishing. */
export const needsPublishing = StatusHelper.needsPublishing;

const UPSTREAM_MISMATCH = 'UPSTREAM_MISMATCH';

/**
 * Pushes the current branch, first asking where to publish it if it isn't on a remote,
 * or where to push it if it tracks a branch that belongs to another, such as main.
 * Resolves true once pushed, and false if it failed or is waiting on the question.
 */
export function usePush() {
  const { status, attempt, openDialog } = useRepositoryContext();

  return async (input) => {
    if (StatusHelper.needsPublishing(status)) {
      openDialog('publishBranch');
      return false;
    }
    const { ok, error } = await attempt('push', input, { handledCodes: [UPSTREAM_MISMATCH] });
    if (error?.code === UPSTREAM_MISMATCH && error.details) {
      openDialog('pushTarget', { mismatch: error.details, input });
    }
    return ok;
  };
}
