import { createApp } from './app.js';
import { config } from './config.js';
import { RepositoryStore } from './store/repositoryStore.js';

const app = createApp({ store: new RepositoryStore(config.dataDir) });

app.listen(config.port, config.host, (error) => {
  if (error) {
    console.error(`Could not start the server: ${error.message}`);
    process.exit(1);
  }
  console.log(`gity-up server listening on http://localhost:${config.port}`);
});
