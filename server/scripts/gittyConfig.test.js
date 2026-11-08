import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { describeScript, loadGittyConfig } from './gittyConfig.js';

let sandbox;
let repo;

const write = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
};

beforeEach(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-config-test-'));
  repo = path.join(sandbox, 'repo');
  await fs.mkdir(repo);
});

afterEach(async () => {
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('loadGittyConfig', () => {
  it('reports no config when there is no .gitty file', async () => {
    expect(await loadGittyConfig(repo)).toEqual({ found: false, scripts: [], errors: [] });
  });

  it('reads scripts written as a list, a map and plain paths', async () => {
    await write(path.join(repo, '.gitty'), {
      scripts: [
        { name: 'Build', path: 'tools/build.sh', args: ['--fast'], description: 'Builds it' },
        { name: 'Lint', command: 'npm run lint' },
        'tools/deploy.ps1',
      ],
    });
    const { found, scripts, errors } = await loadGittyConfig(repo);

    expect(found).toBe(true);
    expect(errors).toEqual([]);
    expect(scripts.map(describeScript)).toEqual([
      expect.objectContaining({
        name: 'Build',
        description: 'Builds it',
        runs: `${path.join(repo, 'tools', 'build.sh')} --fast`,
      }),
      expect.objectContaining({ name: 'Lint', runs: 'npm run lint' }),
      expect.objectContaining({ name: 'deploy.ps1' }),
    ]);

    await write(path.join(repo, '.gitty'), { scripts: { Test: { command: 'npm test' } } });
    const fromMap = await loadGittyConfig(repo);
    expect(fromMap.scripts.map(({ name, command }) => ({ name, command }))).toEqual([
      { name: 'Test', command: 'npm test' },
    ]);
  });

  it('inherits from shared configs, which the repository can override', async () => {
    const shared = path.join(sandbox, 'shared');
    await write(path.join(shared, 'base.gitty'), {
      scripts: [{ name: 'Format', path: 'format.js' }],
    });
    await write(path.join(shared, 'team.gitty'), {
      extends: './base.gitty',
      scripts: [
        { name: 'Lint', command: 'team-lint' },
        { name: 'Release', command: 'team-release' },
      ],
    });
    await write(path.join(repo, '.gitty'), {
      extends: ['../shared/team.gitty'],
      scripts: [{ name: 'Lint', command: 'local-lint' }],
    });

    const { scripts, errors } = await loadGittyConfig(repo);

    expect(errors).toEqual([]);
    expect(scripts.map(({ name }) => name)).toEqual(['Format', 'Release', 'Lint']);
    // Paths in a shared config are relative to that config.
    expect(scripts[0].path).toBe(path.join(shared, 'format.js'));
    expect(scripts.find(({ name }) => name === 'Lint').command).toBe('local-lint');
  });

  it('reports a missing shared config, a loop and bad JSON without losing the rest', async () => {
    await write(path.join(repo, 'a.gitty'), { extends: '.gitty', scripts: { A: 'a.sh' } });
    await write(path.join(repo, '.gitty'), {
      extends: ['missing.gitty', 'a.gitty'],
      scripts: [{ name: 'Both', path: 'x', command: 'y' }, { name: 'Ok', command: 'ok' }],
    });

    const { scripts, errors } = await loadGittyConfig(repo);

    expect(scripts.map(({ name }) => name)).toEqual(['A', 'Ok']);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/missing\.gitty does not exist/);
    expect(errors[1]).toMatch(/extends itself/);
    expect(errors[2]).toMatch(/either a "path" or a "command"/);

    await write(path.join(repo, '.gitty'), '{ not json');
    const broken = await loadGittyConfig(repo);
    expect(broken.found).toBe(true);
    expect(broken.scripts).toEqual([]);
    expect(broken.errors[0]).toMatch(/not valid JSON/);
  });

  describe('shared configs over HTTP', () => {
    let server;
    let baseUrl;

    beforeAll(async () => {
      server = http.createServer((request, response) => {
        if (request.url === '/team.gitty') {
          response.end(JSON.stringify({ extends: 'base.gitty', scripts: { Remote: 'tools/r.sh' } }));
        } else if (request.url === '/base.gitty') {
          response.end(JSON.stringify({ scripts: [{ name: 'Base', command: 'base' }] }));
        } else {
          response.statusCode = 404;
          response.end();
        }
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    afterAll(() => new Promise((resolve) => server.close(resolve)));

    it('follows links relative to the URL, with paths relative to the repository', async () => {
      await write(path.join(repo, '.gitty'), { extends: `${baseUrl}/team.gitty` });

      const { scripts, errors } = await loadGittyConfig(repo);

      expect(errors).toEqual([]);
      expect(scripts.map(({ name }) => name)).toEqual(['Base', 'Remote']);
      expect(scripts[1].path).toBe(path.join(repo, 'tools', 'r.sh'));
    });

    it('reports a URL that fails', async () => {
      await write(path.join(repo, '.gitty'), { extends: `${baseUrl}/nope.gitty` });
      const { errors } = await loadGittyConfig(repo);
      expect(errors[0]).toMatch(/answered 404/);
    });
  });
});
