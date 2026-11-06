import { useRepositoryContext } from './RepositoryContext.js';

/** Whether a push would create the branch on a remote, rather than update it there. */
export function needsPublishing({ upstream, upstreamGone }) {
  return !upstream || upstreamGone;
}

/** Pushes the current branch, first asking where to publish it if it isn't on a remote. */
export function usePush() {
  const { status, run, openDialog } = useRepositoryContext();

  return (input) => {
    if (needsPublishing(status)) openDialog('publishBranch');
    else return run('push', input);
  };
}
