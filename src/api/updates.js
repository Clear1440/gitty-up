import { http } from './client.js';

export const updatesApi = {
  /** The update status. The server checks GitHub first if its last check is stale. */
  get: () => http.get('/updates'),
  check: () => http.post('/updates/check'),
  /** Starts downloading and installing, and answers straight away with the status. */
  install: () => http.post('/updates/install'),
};
