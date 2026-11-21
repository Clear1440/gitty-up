/** The name AI tools list the server under. */
export const MCP_SERVER_NAME = 'gitty-up';

const json = (value) => JSON.stringify(value, null, 2);

/** What every AI tool sends with each request, so Gitty Up knows it was set up here. */
export const authorization = (token) => `Bearer ${token}`;

/**
 * The headers most apps take as they are, to spread into their config. None without a
 * token, for when the settings let AI tools connect without one.
 */
const headers = (token) => (token ? { headers: { Authorization: authorization(token) } } : {});

/**
 * How each AI tool is told about the MCP server at `url`, sending `token`. `where` says
 * where the snippet goes, and `language` is how it is written. `note` adds anything else
 * worth knowing. Each snippet holds the token, so `where` points at the config for every
 * project, which stays on this computer, rather than a project's own, which may be shared.
 */
export const MCP_CLIENTS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    where:
      'Under "mcpServers" in ~/.claude.json, for every project. It holds your token, so keep it out of a shared .mcp.json.',
    language: 'json',
    snippet: (url, token) =>
      json({ mcpServers: { [MCP_SERVER_NAME]: { type: 'http', url, ...headers(token) } } }),
    note: (url, token) =>
      `Or run: claude mcp add --transport http --scope user ${token ? `--header "Authorization: ${authorization(token)}" ` : ''}${MCP_SERVER_NAME} ${url}`,
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    where: 'In claude_desktop_config.json (Settings › Developer › Edit Config), then restart Claude.',
    language: 'json',
    // mcp-remote's own way to send a header: no spaces in the args, which Windows can split.
    snippet: (url, token) =>
      json({
        mcpServers: {
          [MCP_SERVER_NAME]: {
            command: 'npx',
            args: ['-y', 'mcp-remote', url, ...(token ? ['--header', 'Authorization:${AUTH_HEADER}'] : [])],
            ...(token && { env: { AUTH_HEADER: authorization(token) } }),
          },
        },
      }),
    note: () =>
      'Claude Desktop starts its servers as programs, so mcp-remote bridges to this one. It needs Node.js.',
  },
  {
    id: 'opencode',
    name: 'opencode',
    where:
      'In ~/.config/opencode/opencode.json, for every project. It holds your token, so keep it out of a shared project’s opencode.json.',
    language: 'json',
    snippet: (url, token) =>
      json({
        $schema: 'https://opencode.ai/config.json',
        mcp: { [MCP_SERVER_NAME]: { type: 'remote', url, enabled: true, ...headers(token) } },
      }),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    where:
      'In ~/.cursor/mcp.json, for every project. It holds your token, so keep it out of a shared .cursor/mcp.json.',
    language: 'json',
    snippet: (url, token) => json({ mcpServers: { [MCP_SERVER_NAME]: { url, ...headers(token) } } }),
  },
  {
    id: 'vscode',
    name: 'VS Code',
    where:
      'Run MCP: Open User Configuration, for every project. It holds your token, so keep it out of a shared .vscode/mcp.json.',
    language: 'json',
    snippet: (url, token) =>
      json({ servers: { [MCP_SERVER_NAME]: { type: 'http', url, ...headers(token) } } }),
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    where: 'In ~/.codeium/windsurf/mcp_config.json.',
    language: 'json',
    snippet: (url, token) =>
      json({ mcpServers: { [MCP_SERVER_NAME]: { serverUrl: url, ...headers(token) } } }),
  },
  {
    id: 'codex',
    name: 'Codex',
    where: 'In ~/.codex/config.toml.',
    language: 'toml',
    snippet: (url, token) =>
      `[mcp_servers.${MCP_SERVER_NAME}]\nurl = "${url}"${token ? `\nhttp_headers = { Authorization = "${authorization(token)}" }` : ''}`,
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    where:
      'In ~/.gemini/settings.json, for every project. It holds your token, so keep it out of a shared .gemini/settings.json.',
    language: 'json',
    snippet: (url, token) =>
      json({ mcpServers: { [MCP_SERVER_NAME]: { httpUrl: url, ...headers(token) } } }),
  },
];

/** The client `step` places away from `index`, going round from the last to the first. */
export function stepClient(index, step, count = MCP_CLIENTS.length) {
  return (((index + step) % count) + count) % count;
}
