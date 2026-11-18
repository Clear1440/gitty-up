import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCancellable } from './cancellable.js';

const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

let queryClient;
afterEach(() => queryClient?.clear());

/** A query whose request never answers, and the signals each request was given. */
function slowQuery(cancellable) {
  queryClient = new QueryClient();
  const signals = [];
  const queryFn = vi.fn(
    cancellable(({ signal }) => {
      signals.push(signal);
      return new Promise(() => {});
    }),
  );
  const observer = () => new QueryObserver(queryClient, { queryKey: ['slow'], queryFn });
  return { queryFn, signals, observer };
}

describe('cancellable, as built', () => {
  const cancellable = createCancellable(true);

  it('calls the request off once the page is left', async () => {
    const { signals, observer } = slowQuery(cancellable);
    const hide = observer().subscribe(() => {});

    hide();
    await nextTurn();

    expect(signals[0].aborted).toBe(true);
    expect(queryClient.getQueryState(['slow']).fetchStatus).toBe('idle');
  });

  it('passes the page of an infinite query through', async () => {
    const read = vi.fn(async () => []);
    await cancellable(read)({ pageParam: 200, signal: new AbortController().signal });
    expect(read).toHaveBeenCalledWith({ pageParam: 200, signal: expect.any(AbortSignal) });
  });
});

describe('cancellable, in development', () => {
  const cancellable = createCancellable(false);

  it('keeps a request for a page StrictMode shows again, rather than sending it twice', async () => {
    const { queryFn, signals, observer } = slowQuery(cancellable);

    // StrictMode: mount, unmount, and mount again, here a while later.
    observer().subscribe(() => {})();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const hide = observer().subscribe(() => {});

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(signals[0]).toBeUndefined();
    expect(queryClient.getQueryState(['slow']).fetchStatus).toBe('fetching');
    hide();
  });
});
