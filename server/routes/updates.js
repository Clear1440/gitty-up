import { Router } from 'express';

/** Only the desktop app can update itself. Run as a plain server, there is nothing to offer. */
const UNSUPPORTED = { supported: false };

/** `updater` comes from createUpdater, or is null when the app cannot update itself. */
export function createUpdatesRouter(updater) {
  const router = Router();

  router.get('/', async (_request, response) => {
    response.json(updater ? await updater.status() : UNSUPPORTED);
  });

  router.post('/check', async (_request, response) => {
    response.json(updater ? await updater.check() : UNSUPPORTED);
  });

  router.post('/install', async (_request, response) => {
    response.json(updater ? await updater.install() : UNSUPPORTED);
  });

  return router;
}
