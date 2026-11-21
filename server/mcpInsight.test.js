import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { parseBlame, readMergeMessage } from './mcp/gitInsightTools.js';
import { RepositoryStore } from './store/repositoryStore.js';
import { SettingsStore } from './store/settingsStore.js';

let sandbox;
let server;
let baseUrl;
let store;
let token;
let nextId = 1;
/** The main fixture: main, a merged feature branch, a clashing branch, and loose files. */
let work;
let workId;
/** Mid-merge, with one conflicted file. */
let clash;
let clashId;
/** A clone of `work`, so fetch has a remote to reach. */
let clone;
let cloneId;
let featureHash;
let directHash;

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * Sets who commits, and pins settings a user's config could change. A clone needs this
 * too: CI machines have no global identity to fall back on.
 */
function configureRepo(folder) {
  git(folder, 'config', 'user.name', 'Test');
  git(folder, 'config', 'user.email', 'test@example.com');
  git(folder, 'config', 'commit.gpgsign', 'false');
  git(folder, 'config', 'core.autocrlf', 'false');
}

async function initRepo(folder) {
  await fs.mkdir(folder, { recursive: true });
  git(folder, 'init', '--initial-branch=main');
  configureRepo(folder);
}

async function writeAndCommit(cwd, file, content, message) {
  await fs.mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
  await fs.writeFile(path.join(cwd, file), content);
  git(cwd, 'add', '--all');
  git(cwd, 'commit', '-m', message);
}

async function post(body) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

const setMcp = async (changes) => {
  const response = await fetch(`${baseUrl}/api/settings/mcp`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  return response.json();
};

const rpc = (method, params) => post({ jsonrpc: '2.0', id: nextId++, method, params });

/** Calls a tool, resolving with its text, parsed when it is JSON, and whether it failed. */
async function callTool(name, args = {}) {
  const body = await rpc('tools/call', { name, arguments: args });
  const { text } = body.result.content[0];
  let value = text;
  try {
    value = JSON.parse(text);
  } catch {
    // Files come back as plain text.
  }
  return { value, isError: Boolean(body.result.isError) };
}

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-up-mcp-insight-'));

  work = path.join(sandbox, 'work');
  await initRepo(work);
  await writeAndCommit(work, 'src/app.js', 'const greeting = "hello";\nconsole.log(greeting);\n', 'Add the app');
  await writeAndCommit(work, '.gitignore', 'secret.env\n', 'Ignore secrets');
  git(work, 'switch', '-c', 'feature/us2638-search');
  await writeAndCommit(work, 'src/search.js', 'export const find = () => "needle";\n', 'US2638 add search');
  featureHash = git(work, 'rev-parse', 'HEAD');
  git(work, 'switch', 'main');
  await writeAndCommit(work, 'notes.md', 'notes\n', 'Write notes');
  directHash = git(work, 'rev-parse', 'HEAD');
  git(work, 'merge', '--no-ff', 'feature/us2638-search', '-m', 'Merge pull request #12 from someone/feature/us2638-search');
  git(work, 'mv', 'src/app.js', 'src/main.js');
  git(work, 'commit', '-m', 'Rename the app');
  // A branch that changes the same line as main, so merging it would conflict.
  git(work, 'switch', '-c', 'clashing');
  await writeAndCommit(work, 'notes.md', 'their notes\n', 'Change notes one way');
  git(work, 'switch', 'main');
  await writeAndCommit(work, 'notes.md', 'our notes\n', 'Change notes another way');
  // Never fetched from: it only gives find_merge a host to link the pull request on.
  git(work, 'remote', 'add', 'origin', 'https://github.com/example/work.git');
  await fs.writeFile(path.join(work, 'draft.txt'), 'not committed yet\n');
  await fs.writeFile(path.join(work, 'secret.env'), 'TOKEN=shh\n');
  await fs.writeFile(path.join(work, 'src/main.js'), 'const greeting = "hello";\nconsole.log(greeting, "again");\n');
  await fs.writeFile(
    path.join(work, '.gitty'),
    JSON.stringify({
      scripts: [
        { name: 'Say', command: 'node -e "console.log(process.env.GITTY_PARAM_WORD)"', params: [{ name: 'word', default: 'hi' }] },
        { name: 'Fail', command: 'node -e "process.exit(3)"' },
      ],
    }),
  );

  clash = path.join(sandbox, 'clash');
  await initRepo(clash);
  await writeAndCommit(clash, 'notes.md', 'start\n', 'Start');
  git(clash, 'switch', '-c', 'other');
  await writeAndCommit(clash, 'notes.md', 'theirs\n', 'Theirs');
  git(clash, 'switch', 'main');
  await writeAndCommit(clash, 'notes.md', 'ours\n', 'Ours');
  try {
    git(clash, 'merge', 'other');
  } catch {
    // The conflict is the point.
  }

  clone = path.join(sandbox, 'clone');
  git(sandbox, 'clone', '--quiet', work, clone);
  configureRepo(clone);
  await writeAndCommit(clone, 'clone.txt', 'clone\n', 'US2638 follow-up in the clone');
  git(clone, 'switch', '-c', 'feature/us2638-clone');

  const settings = new SettingsStore(path.join(sandbox, 'home'));
  store = new RepositoryStore(path.join(sandbox, 'home'));
  workId = (await store.add(work)).id;
  clashId = (await store.add(clash)).id;
  cloneId = (await store.add(clone)).id;
  const group = await store.addGroup('Services');
  await store.setGroups(workId, [group.id]);
  await store.setGroups(cloneId, [group.id]);

  const app = createApp({ store, settings });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  token = (await setMcp({ enabled: true })).mcp.token;
});

afterAll(async () => {
  // Setup can fail before the server starts, and that failure is the one worth reading.
  if (server) await new Promise((resolve) => server.close(resolve));
  if (sandbox) await fs.rm(sandbox, { recursive: true, force: true });
});

describe('MCP tools for agents', () => {
  it('offers the new read tools and fetch while read-only, with fetch marked as reaching out', async () => {
    const { result } = await rpc('tools/list');
    const tools = new Map(result.tools.map((tool) => [tool.name, tool]));
    for (const name of ['search_code', 'blame', 'find_merge', 'search_log_across', 'find_branch_across', 'read_working_file', 'preview_merge', 'get_conflicts', 'list_scripts']) {
      expect(tools.get(name)?.annotations.readOnlyHint).toBe(true);
    }
    expect(tools.get('fetch').annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: true });
    expect(tools.has('run_script')).toBe(false);
    expect(tools.has('resolve_conflict')).toBe(false);
  });

  describe('search_code', () => {
    it('finds text in a commit, with file and line', async () => {
      const { value } = await callTool('search_code', { repository: workId, pattern: 'greeting' });
      expect(value.matches).toEqual([
        { path: 'src/main.js', line: 1, text: 'const greeting = "hello";' },
        { path: 'src/main.js', line: 2, text: 'console.log(greeting);' },
      ]);
    });

    it('searches the working tree, untracked files included, and takes regexes and case', async () => {
      const disk = await callTool('search_code', { repository: workId, pattern: 'AGAIN|committed', regex: true, ignore_case: true, working_tree: true });
      expect(disk.value.matches.map((match) => match.path).sort()).toEqual(['draft.txt', 'src/main.js']);
      const literal = await callTool('search_code', { repository: workId, pattern: 'AGAIN|committed', working_tree: true });
      expect(literal.value.count).toBe(0);
    });

    it('narrows to a path, caps the matches, and says when it did', async () => {
      const { value } = await callTool('search_code', { repository: workId, pattern: 'e', path: 'src', max_results: 1 });
      expect(value.matches).toHaveLength(1);
      expect(value.count).toBeGreaterThan(1);
      expect(value.note).toMatch(/max_results/);
      const old = await callTool('search_code', { repository: workId, pattern: 'needle', ref: directHash });
      expect(old.value.count).toBe(0);
    });
  });

  describe('blame', () => {
    it('tells who changed each line, in runs, and marks uncommitted lines on disk', async () => {
      const committed = await callTool('blame', { repository: workId, path: 'src/main.js' });
      expect(committed.value.hunks).toHaveLength(1);
      expect(committed.value.hunks[0]).toMatchObject({ start: 1, end: 2, author: 'Test', subject: 'Add the app' });

      const disk = await callTool('blame', { repository: workId, path: 'src/main.js', working_tree: true, start_line: 2 });
      expect(disk.value.hunks).toEqual([
        { start: 2, end: 2, commit: null, uncommitted: true, text: 'console.log(greeting, "again");' },
      ]);
    });

    it('reads blame in a repository with SHA-256 hashes', async () => {
      const sha256 = path.join(sandbox, 'sha256');
      await fs.mkdir(sha256);
      git(sha256, 'init', '--initial-branch=main', '--object-format=sha256');
      configureRepo(sha256);
      await writeAndCommit(sha256, 'a.txt', 'one\n', 'First');
      await fs.writeFile(path.join(sha256, 'a.txt'), 'one\ntwo\n');
      const hunks = parseBlame(git(sha256, 'blame', '--porcelain', '--', 'a.txt'));
      expect(hunks).toEqual([
        expect.objectContaining({ start: 1, end: 1, author: 'Test', subject: 'First', text: 'one' }),
        { start: 2, end: 2, commit: null, uncommitted: true, text: 'two' },
      ]);
      expect(hunks[0].commit).toHaveLength(7);
    });

    it('explains a file it cannot blame', async () => {
      const missing = await callTool('blame', { repository: workId, path: 'nope.js' });
      expect(missing.isError).toBe(true);
      expect(missing.value).toMatch(/Could not blame nope\.js/);
    });
  });

  describe('find_merge', () => {
    it('finds the merge and pull request that brought a commit in', async () => {
      const { value } = await callTool('find_merge', { repository: workId, commit: featureHash, branch: 'main' });
      expect(value).toMatchObject({
        how: 'merged',
        sourceBranch: 'feature/us2638-search',
        pullRequest: { number: 12, url: 'https://github.com/example/work/pull/12' },
        commitsInMerge: 1,
      });
      expect(value.merge.subject).toMatch(/^Merge pull request #12/);
    });

    it('says when a commit was made on the branch itself, or is not on it', async () => {
      const direct = await callTool('find_merge', { repository: workId, commit: directHash, branch: 'main' });
      expect(direct.value.how).toMatch(/committed straight onto the branch/);
      expect(direct.value.merge).toBeUndefined();

      const elsewhere = await callTool('find_merge', { repository: workId, commit: 'clashing', branch: 'main' });
      expect(elsewhere.isError).toBe(true);
      expect(elsewhere.value).toMatch(/is not on main/);
    });

    it('reads the branch and number from each host\'s merge message', () => {
      expect(readMergeMessage('Merge pull request #5 from me/fix/thing')).toEqual({ sourceBranch: 'fix/thing', pullRequest: 5 });
      expect(readMergeMessage("Merge branch 'topic' into 'main'\n\nSee merge request group/app!42")).toEqual({ sourceBranch: 'topic', pullRequest: 42 });
      expect(readMergeMessage('Merged in topic (pull request #9)')).toEqual({ sourceBranch: 'topic', pullRequest: 9 });
      expect(readMergeMessage('Add search (#77)')).toEqual({ sourceBranch: null, pullRequest: 77 });
      expect(readMergeMessage("Merge remote-tracking branch 'origin/x'")).toEqual({ sourceBranch: 'origin/x', pullRequest: null });
    });
  });

  describe('across repositories', () => {
    it('filters list_repositories by group and state, and says when each last fetched', async () => {
      const all = await callTool('list_repositories');
      expect(all.value).toHaveLength(3);
      const byId = new Map(all.value.map((entry) => [entry.id, entry]));
      expect(byId.get(workId).fetchedAt).toBeNull();
      expect(byId.get(workId).groups).toEqual(['Services']);

      const grouped = await callTool('list_repositories', { group: 'services' });
      expect(grouped.value.map((entry) => entry.id).sort()).toEqual([workId, cloneId].sort());
      const dirty = await callTool('list_repositories', { dirty: true });
      expect(dirty.value.map((entry) => entry.id).sort()).toEqual([workId, clashId].sort());
      const onBranch = await callTool('list_repositories', { branch: 'feature/us2638-clone' });
      expect(onBranch.value.map((entry) => entry.id)).toEqual([cloneId]);

      const unknown = await callTool('list_repositories', { group: 'nowhere' });
      expect(unknown.isError).toBe(true);
      expect(unknown.value).toMatch(/The groups are: Services/);
    });

    it('searches history across a group', async () => {
      const { value } = await callTool('search_log_across', { grep: 'us2638', group: 'Services' });
      expect(value.searched).toBe(2);
      const subjects = Object.fromEntries(value.repositories.map((entry) => [entry.repository.id, entry.commits.map((commit) => commit.subject)]));
      expect(subjects[workId]).toEqual(['Merge pull request #12 from someone/feature/us2638-search', 'US2638 add search']);
      expect(subjects[cloneId]).toEqual(expect.arrayContaining(['US2638 follow-up in the clone', 'US2638 add search']));

      const nothing = await callTool('search_log_across', {});
      expect(nothing.isError).toBe(true);
    });

    it('finds a branch in every repository that has it', async () => {
      const { value } = await callTool('find_branch_across', { branch: 'US2638' });
      const byId = new Map(value.repositories.map((entry) => [entry.repository.id, entry]));
      expect([...byId.keys()].sort()).toEqual([workId, cloneId].sort());
      expect(byId.get(workId).local.map((branch) => branch.name)).toEqual(['feature/us2638-search']);
      expect(byId.get(cloneId)).toMatchObject({
        checkedOut: 'feature/us2638-clone',
        local: [{ name: 'feature/us2638-clone', checkedOut: true }],
      });
      expect(byId.get(cloneId).remote.map((branch) => branch.name)).toContain('origin/feature/us2638-search');

      const exact = await callTool('find_branch_across', { branch: 'feature/us2638', exact: true });
      expect(exact.value.repositories).toEqual([]);
    });
  });

  describe('files and history', () => {
    it('reads a file on disk, untracked or changed, by lines', async () => {
      const draft = await callTool('read_working_file', { repository: workId, path: 'draft.txt' });
      expect(draft.value).toBe('not committed yet\n');
      const line = await callTool('read_working_file', { repository: workId, path: 'src/main.js', start_line: 2, end_line: 2 });
      expect(line.value).toBe('[Lines 2-2 of 2]\nconsole.log(greeting, "again");');
      const committed = await callTool('read_file', { repository: workId, path: 'src/main.js', start_line: 2 });
      expect(committed.value).toBe('[Lines 2-2 of 2]\nconsole.log(greeting);');
    });

    it('refuses ignored files, git internals, folders and anything outside the repository', async () => {
      const secret = await callTool('read_working_file', { repository: workId, path: 'secret.env' });
      expect(secret.value).toMatch(/ignored by git/);
      expect((await callTool('read_working_file', { repository: workId, path: '.git/config' })).value).toMatch(/inside \.git/);
      expect((await callTool('read_working_file', { repository: workId, path: 'src' })).value).toMatch(/is a folder/);
      expect((await callTool('read_working_file', { repository: workId, path: '../clash/notes.md' })).isError).toBe(true);

      await fs.symlink(path.join(clash, 'notes.md'), path.join(work, 'escape.md'));
      const escape = await callTool('read_working_file', { repository: workId, path: 'escape.md' });
      expect(escape.value).toMatch(/outside the repository/);
      await fs.rm(path.join(work, 'escape.md'));
    });

    it('follows a file back through a rename', async () => {
      const plain = await callTool('get_log', { repository: workId, path: 'src/main.js' });
      expect(plain.value.map((commit) => commit.subject)).toEqual(['Rename the app']);
      const followed = await callTool('get_log', { repository: workId, path: 'src/main.js', follow: true });
      expect(followed.value.map((commit) => commit.subject)).toEqual(['Rename the app', 'Add the app']);
      expect((await callTool('get_log', { repository: workId, follow: true })).isError).toBe(true);
    });

    it('lists the files a change touches instead of its patch', async () => {
      const commit = await callTool('get_commit_diff', { repository: workId, commit: 'main~1', files_only: true });
      expect(commit.value).toEqual([{ path: 'src/main.js', status: 'renamed', originalPath: 'src/app.js', additions: 0, deletions: 0 }]);
      const uncommitted = await callTool('get_uncommitted_diff', { repository: workId, files_only: true });
      expect(uncommitted.value).toEqual([{ path: 'src/main.js', status: 'modified', additions: 1, deletions: 1 }]);
    });
  });

  describe('merges and conflicts', () => {
    it('previews a merge, listing the files that would conflict, without changing anything', async () => {
      const head = git(work, 'rev-parse', 'HEAD');
      const { value } = await callTool('preview_merge', { repository: workId, source: 'clashing' });
      expect(value).toMatchObject({ source: 'clashing', target: 'main', commits: 1, fastForward: false });
      expect(value.conflicts).toEqual([{ path: 'notes.md', type: 'CONFLICT (contents)' }]);
      expect(git(work, 'rev-parse', 'HEAD')).toBe(head);

      const upToDate = await callTool('preview_merge', { repository: workId, source: 'feature/us2638-search' });
      expect(upToDate.value.upToDate).toBe(true);
      const elsewhere = await callTool('preview_merge', { repository: workId, source: 'main', target: 'clashing' });
      expect(elsewhere.value.blockedBy).toMatch(/checked out branch, which is main/);
    });

    it('shows each conflict, and a whole conflicted file', async () => {
      const listed = await callTool('get_conflicts', { repository: clashId });
      expect(listed.value).toMatchObject({
        operation: 'merge',
        files: [{ path: 'notes.md', conflicts: [{ line: 1, ours: 'ours', theirs: 'theirs' }] }],
      });
      const whole = await callTool('get_conflicts', { repository: clashId, path: 'notes.md' });
      expect(whole.value).toMatchObject({ base: 'start\n', ours: 'ours\n', theirs: 'theirs\n' });
      expect(whole.value.working).toContain('<<<<<<<');

      const clean = await callTool('get_conflicts', { repository: workId });
      expect(clean.value.note).toBe('Nothing is in conflict.');
    });

    it('lists the scripts in .gitty', async () => {
      const { value } = await callTool('list_scripts', { repository: workId });
      expect(value.scripts.map((script) => script.name)).toEqual(['Say', 'Fail']);
      expect((await callTool('list_scripts', { repository: clashId })).value.found).toBe(false);
    });
  });

  describe('fetch while read-only', () => {
    it('fetches, and fetchedAt says when', async () => {
      const before = await callTool('get_status', { repository: cloneId });
      expect(before.value.fetchedAt).toBeNull();
      const fetched = await callTool('fetch', { repository: cloneId });
      expect(fetched.isError).toBe(false);
      const after = await callTool('get_status', { repository: cloneId });
      expect(Date.parse(after.value.fetchedAt)).toBeGreaterThan(Date.now() - 60_000);
    });
  });

  describe('with full access', () => {
    beforeAll(() => setMcp({ access: 'full' }));
    afterAll(() => setMcp({ access: 'read-only' }));

    it('runs a script with its parameters, giving its exit code and output', async () => {
      const said = await callTool('run_script', { repository: workId, name: 'Say', params: { word: 'howdy' } });
      expect(said.value.done).toMatchObject({ exitCode: 0, succeeded: true });
      expect(said.value.done.output.trim()).toBe('howdy');
      const failed = await callTool('run_script', { repository: workId, name: 'Fail' });
      expect(failed.value.done).toMatchObject({ exitCode: 3, succeeded: false });
      const unknown = await callTool('run_script', { repository: workId, name: 'Nope' });
      expect(unknown.value).toMatch(/Its scripts are: "Say", "Fail"/);
    });

    it('resolves a conflict, refusing content that still has markers', async () => {
      const marked = await callTool('resolve_conflict', { repository: clashId, path: 'notes.md', content: '<<<<<<< HEAD\nours\n' });
      expect(marked.value).toMatch(/still has conflict markers/);
      const both = await callTool('resolve_conflict', { repository: clashId, path: 'notes.md', side: 'ours', remove: true });
      expect(both.value).toMatch(/exactly one/);

      const resolved = await callTool('resolve_conflict', { repository: clashId, path: 'notes.md', content: 'ours and theirs\n' });
      expect(resolved.value.done).toMatch(/No conflicts are left/);
      expect(await fs.readFile(path.join(clash, 'notes.md'), 'utf8')).toBe('ours and theirs\n');
      expect(git(clash, 'diff', '--name-only', '--diff-filter=U')).toBe('');
    });
  });
});
