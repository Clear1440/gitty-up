import { createApp } from './app.js';
import { RepositoryStore } from './store/repositoryStore.js';
import { SettingsStore } from './store/settingsStore.js';

/**
 * Starts the server and resolves with it and the port it listens on.
 * Port 0 lets the system pick a free one. Rejects if the port cannot be used.
 * `dataDir` is the home folder for settings. The repositories may live elsewhere,
 * if a different folder was chosen in the settings.
 */
export async function startServer({ host, port, dataDir }) {
  const settings = new SettingsStore(dataDir);
  const store = new RepositoryStore(await settings.dataDir());
  const app = createApp({ store, settings });

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
