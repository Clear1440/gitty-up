import os from 'node:os';
import path from 'node:path';

export const config = {
  // Loopback only: this server runs git against local files and has no auth.
  // The Docker image sets 0.0.0.0, because published ports arrive on the container's own
  // network interface; the localOnly middleware still turns away anything not sent to localhost.
  host: process.env.GITY_UP_HOST ?? '127.0.0.1',
  port: Number(process.env.GITY_UP_PORT ?? 4317),
  dataDir: process.env.GITY_UP_DATA_DIR ?? path.join(os.homedir(), '.gity-up'),
};
