import express, { Router } from 'express';
import { RPC_ERRORS, handleMessage, rpcError } from '../mcp/mcpServer.js';
import { bearerToken, isMcpToken } from '../mcp/mcpToken.js';
import { scopeStore } from '../mcp/repositoryScope.js';

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
 * turned on in the settings, only to this machine, like every route, and only to AI tools
 * that send the token from the settings. The settings also say whether it may only read,
 * or run git commands that change repositories too, and which repositories it may use.
 * All are read afresh for every request, so a change applies at once. Every tool call is
 * recorded in `activity`, the log the settings show.
 *
 * The checks come in this order: local only (in app.js), then turned on, so a server that
 * is off says so to anyone, then the token, before the body is read or anything is logged.
 *
 * Every request is answered on its own with plain JSON, which Streamable HTTP allows, so
 * there are no sessions to keep and nothing for the server to push.
 */
export function createMcpRouter({ settings, store, activity }) {
  const router = Router();

  router.use(async (request, response, next) => {
    const { mcp } = await settings.get();
    if (!mcp.enabled) {
      sendRpcError(
        response,
        403,
        RPC_ERRORS.INVALID_REQUEST,
        'Gitty Up’s MCP server is turned off. Turn it on under Settings › AI tools.',
      );
      return;
    }
    // On unless turned off in the settings, which lets any program on this machine connect.
    const isTokenRequired = mcp.requireToken !== false;
    if (isTokenRequired && !isMcpToken(mcp.token, bearerToken(request.get('Authorization')))) {
      response.set('WWW-Authenticate', 'Bearer');
      sendRpcError(
        response,
        401,
        RPC_ERRORS.INVALID_REQUEST,
        'Gitty Up did not accept this AI tool’s token. Copy the config again from Settings › AI tools in Gitty Up.',
      );
      return;
    }
    response.locals.access = mcp.access;
    response.locals.store = scopeStore(store, mcp.repositories);
    next();
  });

  router.post('/', express.json({ limit: '1mb' }), async (request, response) => {
    const { body } = request;
    if (body === undefined || body === null || typeof body !== 'object') {
      sendRpcError(response, 400, RPC_ERRORS.PARSE, 'Send a JSON-RPC message as application/json.');
      return;
    }
    const messages = Array.isArray(body) ? body : [body];
    const context = { store: response.locals.store, access: response.locals.access, activity };
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
