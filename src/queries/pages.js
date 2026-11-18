/**
 * Rereads the first `pageCount` pages of an offset-paged list in as few requests as
 * `maxPerRequest` allows, and splits the answer back into pages as an infinite query
 * keeps them, with page `i` at offset `i * pageSize`.
 *
 * Git can only answer for an offset by walking every commit before it, so each page of
 * history costs more than the one before. Reading them one at a time costs a walk per
 * page; reading them together costs one walk per request.
 *
 * `fetchBatch({ limit, skip })` resolves with up to `limit` items from offset `skip`.
 */
export async function readPages(fetchBatch, { pageCount, pageSize, maxPerRequest }) {
  const wanted = Math.max(pageCount, 1) * pageSize;
  const items = [];
  while (items.length < wanted) {
    const limit = Math.min(maxPerRequest, wanted - items.length);
    const batch = await fetchBatch({ limit, skip: items.length });
    items.push(...batch);
    if (batch.length < limit) break;
  }
  return splitIntoPages(items, pageSize);
}

/** Pages of `pageSize` items, and the offset each starts at. Always at least one page. */
export function splitIntoPages(items, pageSize) {
  const count = Math.max(Math.ceil(items.length / pageSize), 1);
  const pages = [];
  const pageParams = [];
  for (let index = 0; index < count; index += 1) {
    pages.push(items.slice(index * pageSize, (index + 1) * pageSize));
    pageParams.push(index * pageSize);
  }
  return { pages, pageParams };
}
