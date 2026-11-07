import { createApp } from './app.js';
import { RepositoryStore } from './store/repositoryStore.js';

/**
 * Starts the server and resolves with it and the port it listens on.
 * Port 0 lets the system pick a free one. Rejects if the port cannot be used.
 */
export function startServer({ host, port, dataDir }) {
  const app = createApp({ store: new RepositoryStore(dataDir) });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ server, port: server.address().port });
    });
  });
}
