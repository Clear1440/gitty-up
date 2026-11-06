/**
 * Like `Promise.all(items.map(run))`, with at most `limit` running at once.
 * Spawning git for hundreds of repositories together makes the slowest ones time out.
 */
export async function mapWithLimit(items, limit, run) {
  const results = new Array(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
