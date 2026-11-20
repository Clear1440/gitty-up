import { ApiError } from '../errors.js';
import packageJson from '../../package.json' with { type: 'json' };
import { GIT_TOOLS, ToolError } from './gitTools.js';

/** The MCP versions this server speaks, newest first. */
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

/** JSON-RPC's own error codes. */
export const RPC_ERRORS = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
};

const INSTRUCTIONS =
  'Read-only access to the git repositories linked in Gitty Up, a desktop git client. Start with list_repositories: every other tool takes one of its repositories by id, name or folder. Nothing here can change a repository.';

const TOOLS_BY_NAME = new Map(GIT_TOOLS.map((tool) => [tool.name, tool]));

class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

/** The client's version when this server speaks it, otherwise the newest this server does. */
function negotiateVersion(requested) {
  return PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
}

const describeTool = ({ name, title, description, inputSchema, annotations }) => ({
  name,
  title,
  description,
  inputSchema,
  annotations,
});

const toText = (result) => (typeof result === 'string' ? result : JSON.stringify(result, null, 2));

/**
 * Runs a tool. A mistake in the call, or git refusing, goes back to the AI tool as an
 * error result it can read and correct, rather than as a failed request.
 */
async function callTool(store, params) {
  const tool = TOOLS_BY_NAME.get(params?.name);
  if (!tool) throw new RpcError(RPC_ERRORS.INVALID_PARAMS, `There is no tool called "${params?.name}".`);
  const args = params.arguments ?? {};
  if (typeof args !== 'object' || Array.isArray(args)) {
    throw new RpcError(RPC_ERRORS.INVALID_PARAMS, 'The arguments must be an object.');
  }
  try {
    return { content: [{ type: 'text', text: toText(await tool.run(store, args)) }] };
  } catch (error) {
    const isExpected = error instanceof ToolError || error instanceof ApiError;
    if (!isExpected) console.error(error);
    const message = isExpected ? error.message : 'Unexpected error while reading the repository.';
    return { content: [{ type: 'text', text: message }], isError: true };
  }
}

const METHODS = {
  initialize: (_store, params) => ({
    protocolVersion: negotiateVersion(params?.protocolVersion),
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: 'gitty-up', title: 'Gitty Up', version: packageJson.version },
    instructions: INSTRUCTIONS,
  }),
  ping: () => ({}),
  'tools/list': () => ({ tools: GIT_TOOLS.map(describeTool) }),
  'tools/call': callTool,
  // Not offered, but some clients ask regardless. An empty list reads better than an error.
  'resources/list': () => ({ resources: [] }),
  'resources/templates/list': () => ({ resourceTemplates: [] }),
  'prompts/list': () => ({ prompts: [] }),
};

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Answers one JSON-RPC message, or resolves with null for a notification, which gets
 * no answer. Each request stands alone, so the server keeps no sessions.
 */
export async function handleMessage(store, message) {
  if (!isObject(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return rpcError(isObject(message) ? (message.id ?? null) : null, RPC_ERRORS.INVALID_REQUEST, 'Not a JSON-RPC 2.0 request.');
  }
  const isNotification = !('id' in message);
  if (isNotification) return null;

  const { id, method, params } = message;
  const handler = Object.hasOwn(METHODS, method) ? METHODS[method] : null;
  if (!handler) return rpcError(id, RPC_ERRORS.METHOD_NOT_FOUND, `Method not found: ${method}`);
  try {
    return { jsonrpc: '2.0', id, result: await handler(store, params) };
  } catch (error) {
    if (error instanceof RpcError) return rpcError(id, error.code, error.message);
    console.error(error);
    return rpcError(id, RPC_ERRORS.INTERNAL, 'Unexpected server error.');
  }
}
