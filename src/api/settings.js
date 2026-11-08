import { http } from './client.js';

export const settingsApi = {
  get: () => http.get('/settings'),
  setAppearance: (appearance) => http.put('/settings/appearance', appearance),
  /** A null path moves the data back to the default folder. */
  setDataDir: (path) => http.put('/settings/data-dir', { path }),
};
