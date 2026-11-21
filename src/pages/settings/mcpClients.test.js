import { describe, expect, it } from 'vitest';
import { MCP_CLIENTS, MCP_SERVER_NAME, stepClient } from './mcpClients.js';

const URL = 'http://127.0.0.1:4317/mcp';
const TOKEN = 'abc_DEF-123';
const AUTHORIZATION = `Bearer ${TOKEN}`;

const clientOf = (id) => MCP_CLIENTS.find((client) => client.id === id);
const parse = (id) => JSON.parse(clientOf(id).snippet(URL, TOKEN));

describe('MCP_CLIENTS', () => {
  it('gives every client a unique id and a snippet with the address and token in it', () => {
    expect(new Set(MCP_CLIENTS.map((client) => client.id)).size).toBe(MCP_CLIENTS.length);
    for (const client of MCP_CLIENTS) {
      const snippet = client.snippet(URL, TOKEN);
      expect(snippet).toContain(URL);
      expect(snippet).toContain(MCP_SERVER_NAME);
      expect(snippet).toContain(TOKEN);
      if (client.language === 'json') expect(() => JSON.parse(snippet)).not.toThrow();
    }
  });

  it('writes each config the way its app reads it', () => {
    const headers = { Authorization: AUTHORIZATION };
    expect(parse('claude-code').mcpServers[MCP_SERVER_NAME]).toEqual({ type: 'http', url: URL, headers });
    expect(parse('opencode').mcp[MCP_SERVER_NAME]).toEqual({
      type: 'remote',
      url: URL,
      enabled: true,
      headers,
    });
    expect(parse('cursor').mcpServers[MCP_SERVER_NAME]).toEqual({ url: URL, headers });
    expect(parse('vscode').servers[MCP_SERVER_NAME]).toEqual({ type: 'http', url: URL, headers });
    expect(parse('windsurf').mcpServers[MCP_SERVER_NAME]).toEqual({ serverUrl: URL, headers });
    expect(parse('gemini').mcpServers[MCP_SERVER_NAME]).toEqual({ httpUrl: URL, headers });
  });

  it('passes the token to mcp-remote through the environment, with no spaces in the args', () => {
    const server = parse('claude-desktop').mcpServers[MCP_SERVER_NAME];
    expect(server.args).toEqual(['-y', 'mcp-remote', URL, '--header', 'Authorization:${AUTH_HEADER}']);
    expect(server.env).toEqual({ AUTH_HEADER: AUTHORIZATION });
    for (const arg of server.args) expect(arg).not.toContain(' ');
  });

  it('gives Codex the header in TOML', () => {
    expect(clientOf('codex').snippet(URL, TOKEN)).toBe(
      `[mcp_servers.${MCP_SERVER_NAME}]\nurl = "${URL}"\nhttp_headers = { Authorization = "${AUTHORIZATION}" }`,
    );
  });

  it('leaves the token out of every snippet when none is required', () => {
    for (const client of MCP_CLIENTS) {
      const snippet = client.snippet(URL, null);
      expect(snippet).toContain(URL);
      expect(snippet).not.toContain('Authorization');
      expect(snippet).not.toContain('null');
      if (client.language === 'json') expect(() => JSON.parse(snippet)).not.toThrow();
      if (client.note) expect(client.note(URL, null)).not.toContain('--header');
    }
    expect(clientOf('cursor').snippet(URL, null)).toBe(
      JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { url: URL } } }, null, 2),
    );
    const desktop = JSON.parse(clientOf('claude-desktop').snippet(URL, null)).mcpServers[MCP_SERVER_NAME];
    expect(desktop).toEqual({ command: 'npx', args: ['-y', 'mcp-remote', URL] });
  });

  it('sends the header from the Claude Code command too', () => {
    expect(clientOf('claude-code').note(URL, TOKEN)).toContain(
      `--header "Authorization: ${AUTHORIZATION}"`,
    );
  });

  it('points at the config for every project, never only a project’s own', () => {
    for (const id of ['claude-code', 'opencode', 'cursor', 'vscode', 'gemini']) {
      expect(clientOf(id).where).toMatch(/for every project/);
      expect(clientOf(id).where).toMatch(/token/);
    }
  });
});

describe('stepClient', () => {
  it('goes round in both directions', () => {
    expect(stepClient(0, 1, 3)).toBe(1);
    expect(stepClient(2, 1, 3)).toBe(0);
    expect(stepClient(0, -1, 3)).toBe(2);
  });
});
