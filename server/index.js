import { config } from './config.js';
import { startServer } from './start.js';

try {
  const { port } = await startServer(config);
  console.log(`gity-up server listening on http://localhost:${port}`);
} catch (error) {
  console.error(`Could not start the server: ${error.message}`);
  process.exit(1);
}
