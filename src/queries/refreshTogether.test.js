import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshTogether } from './refreshTogether.js';

const KEY = ['repo', 'commits'];
const THREE_PAGES = { pages: [['a'], ['b'], ['c']], pageParams: [0, 1, 2] };

let queryClient;
let hides;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  hides = [];
});

afterEach(() => {
  hides.forEach((hide) => hide());
  queryClient.clear();
});

/** Shows a paged query with these options, as a page would. Returns how to stop showing it. */
function show(options) {
  const observer = new InfiniteQueryObserver(queryClient, {
    queryKey: KEY,
    initialPageParam: 0,
    getNextPageParam: (_lastPage, pages) => pages.length,
    staleTime: Infinity,
    ...options,
  });
  const hide = observer.subscribe(() => {});
  hides.push(hide);
  return hide;
}

describe('refreshTogether', () => {
  it('rereads every page through meta.readPages when a query has it', async () => {
    const queryFn = vi.fn(async ({ pageParam }) => [`page ${pageParam}`]);
    const fresh = { pages: [['A'], ['B'], ['C']], pageParams: [0, 1, 2] };
    const readPages = vi.fn(async () => fresh);
    queryClient.setQueryData(KEY, THREE_PAGES);
    show({ queryFn, meta: { readPages } });

    await refreshTogether(queryClient, ['repo']);

    expect(readPages).toHaveBeenCalledTimes(1);
    expect(readPages).toHaveBeenCalledWith(3, { signal: expect.any(AbortSignal) });
    expect(queryFn).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(KEY)).toEqual(fresh);
  });

  it('otherwise rereads the pages one at a time', async () => {
    const queryFn = vi.fn(async ({ pageParam }) => [`page ${pageParam}`]);
    queryClient.setQueryData(KEY, THREE_PAGES);
    show({ queryFn });

    await refreshTogether(queryClient, ['repo']);

    expect(queryFn).toHaveBeenCalledTimes(3);
    expect(queryClient.getQueryData(KEY).pages).toEqual([['page 0'], ['page 1'], ['page 2']]);
  });

  it('marks a query that left the screen meanwhile as stale, instead of filling it', async () => {
    let answer;
    const readPages = () => new Promise((resolve) => (answer = resolve));
    queryClient.setQueryData(KEY, THREE_PAGES);
    const hide = show({ queryFn: async () => ['unused'], meta: { readPages } });

    const refreshing = refreshTogether(queryClient, ['repo']);
    hide();
    answer({ pages: [['A'], ['B'], ['C'], ['D']], pageParams: [0, 1, 2, 3] });
    await refreshing;

    expect(queryClient.getQueryData(KEY)).toEqual(THREE_PAGES);
    expect(queryClient.getQueryState(KEY).isInvalidated).toBe(true);
  });
});
