import { http } from './client.js';

/** The log of what AI tools did through the MCP server. */
export const aiActivityApi = {
  /** Every entry, newest first, as `{ entries }`. */
  list: ({ signal } = {}) => http.get('/ai-activity', undefined, { signal }),
  clear: () => http.delete('/ai-activity'),
  /** Takes back what an entry did, and answers with the entry, now marked as undone. */
  undo: (id) => http.post(`/ai-activity/${encodeURIComponent(id)}/undo`),
};
