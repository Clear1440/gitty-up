import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { localOnly } from './middleware/localOnly.js';
import { createFilesystemRouter } from './routes/filesystem.js';
import { createRepositoriesRouter } from './routes/repositories.js';

const CLIENT_DIR = path.resolve(import.meta.dirname, '../dist');

export function createApp({ store }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(localOnly);
  // A resolved conflict sends the whole file back, which can be far over the 100kb default.
  app.use(express.json({ limit: '50mb' }));

  app.use('/api/repositories', createRepositoriesRouter(store));
  app.use('/api/filesystem', createFilesystemRouter());
  app.use('/api', notFoundHandler);

  // In production the server also hosts the built client.
  if (fs.existsSync(CLIENT_DIR)) {
    app.use(express.static(CLIENT_DIR));
    app.get('/{*route}', (_request, response) => {
      response.sendFile(path.join(CLIENT_DIR, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
