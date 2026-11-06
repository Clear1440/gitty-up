import os from 'node:os';
import path from 'node:path';

export const config = {
  // Loopback only: this server runs git against local files and has no auth.
  host: '127.0.0.1',
  port: Number(process.env.GITY_UP_PORT ?? 4317),
  dataDir: process.env.GITY_UP_DATA_DIR ?? path.join(os.homedir(), '.gity-up'),
};
