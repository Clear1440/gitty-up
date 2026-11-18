import { InfiniteQueryObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { trimHiddenPages } from './trimHiddenPages.js';

const KEY = ['history'];
const THREE_PAGES = { pages: [['a'], ['b'], ['c']], pageParams: [0, 1, 2] };

/** Lets the trim, which waits a turn, run. */
const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

let queryClient;
let stopTrimming;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  stopTrimming = trimHiddenPages(queryClient);
});

afterEach(() => {
  stopTrimming();
  queryClient.clear();
});

/** Shows the history, as its page would. Returns a function that stops showing it. */
function show(queryKey = KEY) {
  const observer = new InfiniteQueryObserver(queryClient, {
    queryKey,
    queryFn: ({ pageParam }) => [String(pageParam)],
    initialPageParam: 0,
    getNextPageParam: (_lastPage, pages) => pages.length,
    staleTime: Infinity,
  });
  return observer.subscribe(() => {});
}

describe('trimHiddenPages', () => {
  it('keeps only the first page once nothing shows the query', async () => {
    queryClient.setQueryData(KEY, THREE_PAGES);
    const hide = show();

    hide();
    await nextTurn();

    expect(queryClient.getQueryData(KEY)).toEqual({ pages: [['a']], pageParams: [0] });
  });

  it('leaves a query that is shown again before the trim runs', async () => {
    queryClient.setQueryData(KEY, THREE_PAGES);

    show()();
    const hide = show();
    await nextTurn();

    expect(queryClient.getQueryData(KEY)).toEqual(THREE_PAGES);
    hide();
  });

  it('keeps it as stale as it was, so it still refetches when shown again', async () => {
    queryClient.setQueryData(KEY, THREE_PAGES, { updatedAt: 1_000 });
    const hide = show();
    await queryClient.invalidateQueries({ queryKey: KEY, refetchType: 'none' });

    hide();
    await nextTurn();

    const state = queryClient.getQueryState(KEY);
    expect(state.data.pages).toHaveLength(1);
    expect(state.dataUpdatedAt).toBe(1_000);
    expect(state.isInvalidated).toBe(true);
  });

  it('trims after a refetch left under way is called off and its pages put back', async () => {
    queryClient.setQueryData(KEY, THREE_PAGES, { updatedAt: 1 });
    let signalSeen;
    const observer = new InfiniteQueryObserver(queryClient, {
      queryKey: KEY,
      // Never answers, like a slow git log, until it is called off.
      queryFn: ({ signal }) => {
        signalSeen = signal;
        return new Promise(() => {});
      },
      initialPageParam: 0,
      getNextPageParam: (_lastPage, pages) => pages.length,
      staleTime: 0,
    });
    const hide = observer.subscribe(() => {});
    expect(queryClient.getQueryState(KEY).fetchStatus).toBe('fetching');

    hide();
    await nextTurn();

    expect(signalSeen.aborted).toBe(true);
    expect(queryClient.getQueryState(KEY).fetchStatus).toBe('idle');
    expect(queryClient.getQueryData(KEY)).toEqual({ pages: [['a']], pageParams: [0] });
  });

  it('leaves queries that are not paged alone', async () => {
    queryClient.setQueryData(['status'], { files: [1, 2, 3] });
    const observer = new QueryObserver(queryClient, {
      queryKey: ['status'],
      queryFn: () => ({ files: [] }),
      staleTime: Infinity,
    });

    observer.subscribe(() => {})();
    await nextTurn();

    expect(queryClient.getQueryData(['status'])).toEqual({ files: [1, 2, 3] });
  });

  it('stops when asked', async () => {
    stopTrimming();
    queryClient.setQueryData(KEY, THREE_PAGES);

    show()();
    await nextTurn();

    expect(queryClient.getQueryData(KEY)).toEqual(THREE_PAGES);
  });
});
