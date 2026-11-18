/**
 * Cuts an infinite query back to its first page once nothing shows it, such as the
 * history of a tab that was left. Its first page stays cached, so switching back shows
 * it straight away. Without this, every page ever loaded stayed cached, and every
 * return to the tab refetched and redrew all of them, so switching tabs grew slower the
 * further back each history had been read.
 *
 * Returns a function that stops watching.
 */
export function trimHiddenPages(queryClient) {
  const queryCache = queryClient.getQueryCache();
  return queryCache.subscribe((event) => {
    if (event.type !== 'observerRemoved') return;
    // A turn later: a fetch the page left is called off and its data put back after
    // this, and a quick return, or React's StrictMode, may be showing it again by then.
    setTimeout(() => trimToFirstPage(queryClient, event.query));
  });
}

function trimToFirstPage(queryClient, query) {
  const { data, fetchStatus } = query.state;
  const isStillCached = queryClient.getQueryCache().get(query.queryHash) === query;
  if (!isStillCached || query.getObserversCount() > 0 || fetchStatus !== 'idle') return;
  if (!Array.isArray(data?.pages) || data.pages.length <= 1) return;
  const { dataUpdatedAt, isInvalidated } = query.state;
  // Fewer pages, not newer ones: it is as stale as before, and refetches when it would have.
  queryClient.setQueryData(
    query.queryKey,
    { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
    { updatedAt: dataUpdatedAt },
  );
  if (isInvalidated) query.invalidate();
}
