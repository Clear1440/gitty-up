import express, { Router } from 'express';
import { RPC_ERRORS, handleMessage, rpcError } from '../mcp/mcpServer.js';

/** Where AI tools connect, as an MCP server over Streamable HTTP. */
export const MCP_PATH = '/mcp';

/**
 * The address AI tools connect to. The port is the one this request reached, so it is
 * right even when the desktop app had to fall back to another one, or the page came
 * through the dev server's proxy. 127.0.0.1 rather than localhost, as some clients try
 * IPv6 first, where the server is not listening.
 */
export const mcpUrl = (request) => `http://127.0.0.1:${request.socket.localPort}${MCP_PATH}`;

const sendRpcError = (response, status, code, message) =>
  response.status(status).json(rpcError(null, code, message));

/**
 * The MCP server: git tools for AI tools such as Claude Code. It answers only while
 * turned on in the settings, and, like every route, only to this machine. The settings
 * also say whether it may only read, or run git commands that change repositories too.
 * Both are read afresh for every request, so a change applies at once.
 *
 * Every request is answered on its own with plain JSON, which Streamable HTTP allows, so
 * there are no sessions to keep and nothing for the server to push.
 */
export function createMcpRouter({ settings, store }) {
  const router = Router();

  router.use(async (_request, response, next) => {
    const { mcp } = await settings.get();
    if (mcp.enabled) {
      response.locals.access = mcp.access;
      next();
      return;
    }
    sendRpcError(
      response,
      403,
      RPC_ERRORS.INVALID_REQUEST,
      'Gitty Up’s MCP server is turned off. Turn it on under Settings › AI tools.',
    );
  });

  router.post('/', express.json({ limit: '1mb' }), async (request, response) => {
    const { body } = request;
    if (body === undefined || body === null || typeof body !== 'object') {
      sendRpcError(response, 400, RPC_ERRORS.PARSE, 'Send a JSON-RPC message as application/json.');
      return;
    }
    const messages = Array.isArray(body) ? body : [body];
    const context = { store, access: response.locals.access };
    const replies = (
      await Promise.all(messages.map((message) => handleMessage(context, message)))
    ).filter(Boolean);
    // Only notifications came, and they get no answer.
    if (replies.length === 0) {
      response.status(202).end();
      return;
    }
    response.json(Array.isArray(body) ? replies : replies[0]);
  });

  // No stream to open and no session to end.
  router.all('/', (_request, response) => {
    response.set('Allow', 'POST');
    sendRpcError(response, 405, RPC_ERRORS.INVALID_REQUEST, 'Only POST is supported.');
  });

  // Express identifies error handlers by their four-argument signature.
  // eslint-disable-next-line no-unused-vars
  router.use((error, _request, response, _next) => {
    if (error.type === 'entity.parse.failed') {
      sendRpcError(response, 400, RPC_ERRORS.PARSE, 'Malformed JSON.');
      return;
    }
    console.error(error);
    sendRpcError(response, 500, RPC_ERRORS.INTERNAL, 'Unexpected server error.');
  });

  return router;
}
