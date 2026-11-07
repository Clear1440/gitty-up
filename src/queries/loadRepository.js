import { branchesQuery, commitsQuery, stashesQuery, statusQuery } from './git.js';
import { repositoryQuery } from './repositories.js';

/** Loads still in flight, so every render waiting on one gets the same promise. */
const inFlight = new Map();

/**
 * Returned once everything is cached. React must see `use()` again when it retries a
 * render that suspended, and these fields tell it this promise needn't be waited on.
 */
const READY = Object.assign(Promise.resolve(), { status: 'fulfilled', value: undefined });

/** What the repository page needs before it can show anything useful. */
function firstScreenQueries(repositoryId, ref) {
  return [
    repositoryQuery(repositoryId),
    statusQuery(repositoryId),
    branchesQuery(repositoryId),
    stashesQuery(repositoryId),
    commitsQuery(repositoryId, ref),
  ];
}

/** A failed query counts as loaded too: the page has an error to show for it. */
function hasSettled(queryClient, { queryKey }) {
  const state = queryClient.getQueryState(queryKey);
  return Boolean(state) && state.status !== 'pending';
}

/**
 * Fetches whatever a repository's first screen still lacks, returning a promise that
 * settles, never rejecting, once it is all cached. Passing it to `use()` during a
 * navigation keeps the previous page up until this one is ready.
 */
export function loadRepository(queryClient, repositoryId, ref) {
  const missing = firstScreenQueries(repositoryId, ref).filter(
    (query) => !hasSettled(queryClient, query),
  );
  if (missing.length === 0) return READY;

  const key = JSON.stringify([repositoryId, ref ?? null]);
  if (!inFlight.has(key)) {
    const promise = Promise.allSettled(
      missing.map((query) =>
        'initialPageParam' in query
          ? queryClient.prefetchInfiniteQuery(query)
          : queryClient.prefetchQuery(query),
      ),
    ).finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
  }
  return inFlight.get(key);
}

/** The history `ref` a saved tab path points at, if any. */
export function refFromPath(path) {
  const query = path.split('?')[1];
  return new URLSearchParams(query).get('ref') ?? undefined;
}
