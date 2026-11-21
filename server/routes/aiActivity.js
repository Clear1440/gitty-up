import { Router } from 'express';
import { describeUndo, undoActivity } from '../mcp/activityUndo.js';

/** An entry as the app shows it, saying whether and how it can be undone. */
const describe = (entry) => ({ ...entry, undo: describeUndo(entry) });

/**
 * The log of what AI tools did through the MCP server, for the settings page. It is the
 * app's own API, not the MCP server's: AI tools cannot read, clear or undo it.
 */
export function createAiActivityRouter({ activity, store }) {
  const router = Router();

  router.get('/', async (_request, response) => {
    response.json({ entries: (await activity.list()).map(describe) });
  });

  router.delete('/', async (_request, response) => {
    await activity.clear();
    response.status(204).end();
  });

  router.post('/:id/undo', async (request, response) => {
    response.json(describe(await undoActivity({ activity, store }, request.params.id)));
  });

  return router;
}
