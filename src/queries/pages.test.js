import { describe, expect, it, vi } from 'vitest';
import { readPages, splitIntoPages } from './pages.js';

/** A list of `total` numbers, answered `{ limit, skip }` at a time as the server does. */
function fakeServer(total) {
  const items = Array.from({ length: total }, (_, index) => index);
  return vi.fn(async ({ limit, skip }) => items.slice(skip, skip + limit));
}

describe('splitIntoPages', () => {
  it('splits into pages with the offset each starts at', () => {
    expect(splitIntoPages([1, 2, 3, 4, 5], 2)).toEqual({
      pages: [[1, 2], [3, 4], [5]],
      pageParams: [0, 2, 4],
    });
  });

  it('keeps one empty page for an empty list, as an infinite query needs one', () => {
    expect(splitIntoPages([], 100)).toEqual({ pages: [[]], pageParams: [0] });
  });
});

describe('readPages', () => {
  it('reads many pages in one request', async () => {
    const fetchBatch = fakeServer(1_000);

    const { pages, pageParams } = await readPages(fetchBatch, {
      pageCount: 3,
      pageSize: 100,
      maxPerRequest: 500,
    });

    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(fetchBatch).toHaveBeenCalledWith({ limit: 300, skip: 0 });
    expect(pages.map((page) => page.length)).toEqual([100, 100, 100]);
    expect(pages[2][0]).toBe(200);
    expect(pageParams).toEqual([0, 100, 200]);
  });

  it('asks in batches no bigger than the server sends', async () => {
    const fetchBatch = fakeServer(5_000);

    const { pages } = await readPages(fetchBatch, {
      pageCount: 12,
      pageSize: 100,
      maxPerRequest: 500,
    });

    expect(fetchBatch.mock.calls.map(([call]) => call)).toEqual([
      { limit: 500, skip: 0 },
      { limit: 500, skip: 500 },
      { limit: 200, skip: 1_000 },
    ]);
    expect(pages).toHaveLength(12);
    expect(pages[11].at(-1)).toBe(1_199);
  });

  it('stops at the end of the list, which may now be shorter', async () => {
    const fetchBatch = fakeServer(650);

    const { pages } = await readPages(fetchBatch, {
      pageCount: 10,
      pageSize: 100,
      maxPerRequest: 500,
    });

    expect(fetchBatch).toHaveBeenCalledTimes(2);
    expect(pages.map((page) => page.length)).toEqual([100, 100, 100, 100, 100, 100, 50]);
  });

  it('reads at least one page', async () => {
    const fetchBatch = fakeServer(0);

    const result = await readPages(fetchBatch, { pageCount: 0, pageSize: 100, maxPerRequest: 500 });

    expect(fetchBatch).toHaveBeenCalledWith({ limit: 100, skip: 0 });
    expect(result).toEqual({ pages: [[]], pageParams: [0] });
  });
});
