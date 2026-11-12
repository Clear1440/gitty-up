import { notifyManager } from '@tanstack/react-query';

/** The data an infinite query would hold after refetching as many pages as it has now. */
async function fetchInfinite(query, fetchPage) {
  const { initialPageParam, getNextPageParam } = query.options;
  const pageCount = Math.max(query.state.data?.pages.length ?? 1, 1);
  const pages = [];
  const pageParams = [];

  let pageParam = initialPageParam;
  for (let index = 0; index < pageCount; index += 1) {
    const page = await fetchPage(pageParam);
    pages.push(page);
    pageParams.push(pageParam);
    pageParam = getNextPageParam(page, pages, pageParam, pageParams);
    if (pageParam === undefined || pageParam === null) break;
  }
  return { pages, pageParams };
}

/** Runs a query's own fetch without putting the result in the cache. */
function fetchFresh(queryClient, query) {
  const { queryFn } = query.options;
  if (typeof queryFn !== 'function') throw new Error('No query function to call');
  const fetchPage = (pageParam) =>
    queryFn({
      client: queryClient,
      queryKey: query.queryKey,
      meta: query.meta,
      signal: new AbortController().signal,
      pageParam,
      direction: 'forward',
    });
  const isInfinite = typeof query.options.getNextPageParam === 'function';
  return isInfinite ? fetchInfinite(query, fetchPage) : fetchPage(undefined);
}

/**
 * Refetches every query under `queryKey` that is on screen, and puts all the answers in
 * the cache at once. Invalidating instead lets each one land as it arrives, so the page
 * changes several times over, the status before the branches before the history, and
 * can show a mix of before and after. Those not on screen are marked stale, to refetch
 * when next shown.
 *
 * A query that fails is left to refetch the usual way, so it shows its error as usual.
 */
export async function refreshTogether(queryClient, queryKey) {
  const queries = queryClient.getQueryCache().findAll({ queryKey });
  const shown = queries.filter((query) => query.isActive());

  const results = await Promise.all(
    shown.map(async (query) => {
      try {
        return { query, ok: true, data: await fetchFresh(queryClient, query) };
      } catch {
        return { query, ok: false };
      }
    }),
  );

  notifyManager.batch(() => {
    for (const { query, ok, data } of results) {
      if (ok) queryClient.setQueryData(query.queryKey, data);
    }
  });

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey,
      refetchType: 'none',
      predicate: (query) => !query.isActive(),
    }),
    ...results
      .filter(({ ok }) => !ok)
      .map(({ query }) => queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true })),
  ]);
}
