import { http } from './client.js';

export const settingsApi = {
  get: () => http.get('/settings'),
  setAppearance: (appearance) => http.put('/settings/appearance', appearance),
  /** Changes the MCP server for AI tools: `{ enabled }`, `{ access }`, or both. */
  setMcp: (changes) => http.put('/settings/mcp', changes),
  /** A null path moves the data back to the default folder. */
  setDataDir: (path) => http.put('/settings/data-dir', { path }),
};
