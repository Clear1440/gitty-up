import { http } from './client.js';

export const settingsApi = {
  get: () => http.get('/settings'),
  setAppearance: (appearance) => http.put('/settings/appearance', appearance),
  /** Changes the MCP server for AI tools: `{ enabled }`, `{ access }`, or both. */
  setMcp: (changes) => http.put('/settings/mcp', changes),
  /** Replaces the token AI tools send to the MCP server. The old one stops working. */
  regenerateMcpToken: () => http.post('/settings/mcp/token'),
  /** A null path moves the data back to the default folder. */
  setDataDir: (path) => http.put('/settings/data-dir', { path }),
};
