/**
 * Wraps a query function that takes `{ signal, pageParam }`, so that its request is called
 * off once nothing shows its query any more, such as when its tab is left.
 *
 * React Query does this only for a query function that reads its `signal`. That is left
 * out in development: React's StrictMode mounts every page a second time there, sometimes
 * well after the first, and each request still under way would be called off and sent
 * again. The built app has no StrictMode, so it calls requests off as it should.
 */
export function createCancellable(callsOff) {
  return (queryFn) => (context) =>
    // Only what is needed is read: reading `signal`, or copying the whole context, is
    // what tells React Query it may call the request off.
    queryFn({ pageParam: context.pageParam, signal: callsOff ? context.signal : undefined });
}

export const cancellable = createCancellable(!import.meta.env.DEV);
