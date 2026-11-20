import { describe, expect, it } from 'vitest';
import { MCP_CLIENTS, MCP_SERVER_NAME, stepClient } from './mcpClients.js';

const URL = 'http://127.0.0.1:4317/mcp';

describe('MCP_CLIENTS', () => {
  it('gives every client a unique id and a snippet with the address in it', () => {
    expect(new Set(MCP_CLIENTS.map((client) => client.id)).size).toBe(MCP_CLIENTS.length);
    for (const client of MCP_CLIENTS) {
      const snippet = client.snippet(URL);
      expect(snippet).toContain(URL);
      expect(snippet).toContain(MCP_SERVER_NAME);
      if (client.language === 'json') expect(() => JSON.parse(snippet)).not.toThrow();
    }
  });

  it('writes each config the way its app reads it', () => {
    const parse = (id) => JSON.parse(MCP_CLIENTS.find((client) => client.id === id).snippet(URL));
    expect(parse('claude-code').mcpServers[MCP_SERVER_NAME]).toEqual({ type: 'http', url: URL });
    expect(parse('opencode').mcp[MCP_SERVER_NAME]).toEqual({ type: 'remote', url: URL, enabled: true });
    expect(parse('vscode').servers[MCP_SERVER_NAME]).toEqual({ type: 'http', url: URL });
  });
});

describe('stepClient', () => {
  it('goes round in both directions', () => {
    expect(stepClient(0, 1, 3)).toBe(1);
    expect(stepClient(2, 1, 3)).toBe(0);
    expect(stepClient(0, -1, 3)).toBe(2);
  });
});
