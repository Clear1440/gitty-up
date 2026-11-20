/** The name AI tools list the server under. */
export const MCP_SERVER_NAME = 'gitty-up';

const json = (value) => JSON.stringify(value, null, 2);

/**
 * How each AI tool is told about the MCP server at `url`. `where` says where the snippet
 * goes, and `language` is how it is written. `note` adds anything else worth knowing.
 */
export const MCP_CLIENTS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    where: 'In .mcp.json at the root of a project, or under "mcpServers" in ~/.claude.json for every project.',
    language: 'json',
    snippet: (url) => json({ mcpServers: { [MCP_SERVER_NAME]: { type: 'http', url } } }),
    note: (url) => `Or run: claude mcp add --transport http --scope user ${MCP_SERVER_NAME} ${url}`,
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    where: 'In claude_desktop_config.json (Settings › Developer › Edit Config), then restart Claude.',
    language: 'json',
    snippet: (url) =>
      json({ mcpServers: { [MCP_SERVER_NAME]: { command: 'npx', args: ['-y', 'mcp-remote', url] } } }),
    note: () =>
      'Claude Desktop starts its servers as programs, so mcp-remote bridges to this one. It needs Node.js.',
  },
  {
    id: 'opencode',
    name: 'opencode',
    where: 'In opencode.json at the root of a project, or ~/.config/opencode/opencode.json for every project.',
    language: 'json',
    snippet: (url) =>
      json({
        $schema: 'https://opencode.ai/config.json',
        mcp: { [MCP_SERVER_NAME]: { type: 'remote', url, enabled: true } },
      }),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    where: 'In .cursor/mcp.json in a project, or ~/.cursor/mcp.json for every project.',
    language: 'json',
    snippet: (url) => json({ mcpServers: { [MCP_SERVER_NAME]: { url } } }),
  },
  {
    id: 'vscode',
    name: 'VS Code',
    where: 'In .vscode/mcp.json in a project, or run MCP: Open User Configuration for every project.',
    language: 'json',
    snippet: (url) => json({ servers: { [MCP_SERVER_NAME]: { type: 'http', url } } }),
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    where: 'In ~/.codeium/windsurf/mcp_config.json.',
    language: 'json',
    snippet: (url) => json({ mcpServers: { [MCP_SERVER_NAME]: { serverUrl: url } } }),
  },
  {
    id: 'codex',
    name: 'Codex',
    where: 'In ~/.codex/config.toml.',
    language: 'toml',
    snippet: (url) => `[mcp_servers.${MCP_SERVER_NAME}]\nurl = "${url}"`,
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    where: 'In .gemini/settings.json in a project, or ~/.gemini/settings.json for every project.',
    language: 'json',
    snippet: (url) => json({ mcpServers: { [MCP_SERVER_NAME]: { httpUrl: url } } }),
  },
];

/** The client `step` places away from `index`, going round from the last to the first. */
export function stepClient(index, step, count = MCP_CLIENTS.length) {
  return (((index + step) % count) + count) % count;
}
