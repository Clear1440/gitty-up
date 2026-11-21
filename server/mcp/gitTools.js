import path from 'node:path';
import * as git from '../git/gitService.js';
import { COMMIT_LOG_FLAGS, parseCommits, parseNameStatus } from '../git/parsers.js';
import { GIT_CONCURRENCY, runGit, runGitOnPaths } from '../git/runGit.js';
import { groupIdsOf } from '../store/repositoryStore.js';
import { AsyncHelper } from '../utils/AsyncHelper.js';

/** Longer text is cut short, so one huge diff can't flood the AI tool's context. */
export const MAX_TEXT_LENGTH = 100_000;
const DEFAULT_LOG_LIMIT = 50;
const MAX_LOG_LIMIT = 500;
const MAX_LISTED_FILES = 5_000;
/** What get_log walks for all_branches. */
export const ALL_REFS = ['--branches', '--remotes', '--tags', 'HEAD'];

/** Pins down everything a user's config could change, as gitService does for the app. */
const DIFF_FLAGS = ['--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'];

const IGNORE_WHITESPACE = {
  type: 'boolean',
  description: 'Leave out changes to spaces and tabs, as git diff -w does, such as code that was only reindented.',
};

/** The flags for a diff, leaving out whitespace changes when the AI tool asked. */
const diffFlags = (args) => [
  ...DIFF_FLAGS,
  ...(readBoolean(args, 'ignore_whitespace') ? ['--ignore-all-space'] : []),
];

/** A mistake in what the AI tool asked for. Its message goes back to the tool to correct. */
export class ToolError extends Error {}

// Arguments

export const REPOSITORY = {
  type: 'string',
  description: 'The repository: its id, name or folder, as list_repositories gives them.',
};
export const REF = (description) => ({ type: 'string', description });
export const PATH = (description) => ({ type: 'string', description });

export function readString(args, name, { required = false } = {}) {
  const value = args[name];
  if (value === undefined || value === null || value === '') {
    if (required) throw new ToolError(`"${name}" is required.`);
    return undefined;
  }
  if (typeof value !== 'string') throw new ToolError(`"${name}" must be a string.`);
  return value;
}

/** A ref, hash or revision expression. One starting with "-" would reach git as an option. */
export function readRef(args, name, options) {
  const ref = readString(args, name, options)?.trim();
  if (ref?.startsWith('-')) throw new ToolError(`"${name}" cannot start with "-".`);
  return ref;
}

export function readCount(args, name, fallback, max = Number.MAX_SAFE_INTEGER) {
  const value = args[name];
  if (value === undefined || value === null) return fallback;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new ToolError(`"${name}" must be a whole number of 0 or more.`);
  }
  return Math.min(count, max);
}

export function readBoolean(args, name) {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new ToolError(`"${name}" must be true or false.`);
  return value;
}

/** A path inside the repository, as git spells it: relative to its root, with forward slashes. */
export function readRepoPath(args, name, options) {
  const value = readString(args, name, options);
  if (value === undefined) return undefined;
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new ToolError(`"${name}" must be a path inside the repository, relative to its root.`);
  }
  return normalized || undefined;
}

/** A line number of 1 or more, or undefined when left out. */
export function readLineNumber(args, name) {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || value < 1) throw new ToolError(`"${name}" must be a whole number of 1 or more.`);
  return value;
}

/**
 * Lines `start_line` to `end_line` of `text`, numbered from 1, or all of it when neither is
 * given. Says which lines it holds and how many the file has, so the AI tool can page on.
 */
export function sliceLines(text, args) {
  const start = readLineNumber(args, 'start_line');
  const end = readLineNumber(args, 'end_line');
  if (start === undefined && end === undefined) return text;
  const lines = text.split('\n');
  // A file ending in a newline has no line after it.
  const total = lines.at(-1) === '' ? lines.length - 1 : lines.length;
  const from = start ?? 1;
  const to = Math.min(end ?? total, total);
  if (from > total) throw new ToolError(`The file has only ${total} lines.`);
  if (to < from) throw new ToolError('"end_line" must not come before "start_line".');
  return `[Lines ${from}-${to} of ${total}]\n${lines.slice(from - 1, to).join('\n')}`;
}

export const LINE_RANGE = {
  start_line: { type: 'integer', minimum: 1, description: 'Only from this line on, counting from 1.' },
  end_line: { type: 'integer', minimum: 1, description: 'Only up to this line, included.' },
};

// Repositories

const isSameFolder = (a, b) => {
  const normalize = (folder) => {
    const resolved = path.resolve(folder);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(a) === normalize(b);
};

/** The linked repository the AI tool named, by id, folder or name. */
export async function findRepository(store, args) {
  const wanted = readString(args, 'repository', { required: true }).trim();
  const repositories = await store.list();
  const match =
    repositories.find((repository) => repository.id === wanted) ??
    repositories.find((repository) => repository.path && isSameFolder(repository.path, wanted));
  const byName = match
    ? [match]
    : repositories.filter((repository) => repository.name.toLowerCase() === wanted.toLowerCase());

  if (byName.length === 0) {
    throw new ToolError(`No linked repository is called "${wanted}". Call list_repositories to see them.`);
  }
  if (byName.length > 1) {
    const ids = byName.map((repository) => `${repository.id} (${repository.path})`).join(', ');
    throw new ToolError(`More than one repository is called "${wanted}". Use an id instead: ${ids}.`);
  }
  const [repository] = byName;
  if (!repository.path) {
    throw new ToolError(`${repository.name} is only known by its remote, and has not been cloned yet.`);
  }
  return repository;
}

/** The full hash of a commit, from anything git can name one by. */
export async function resolveCommit(repoPath, ref) {
  try {
    const output = await runGit(repoPath, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`, '--']);
    return output.trim().split('\n')[0];
  } catch {
    throw new ToolError(`"${ref}" does not name a commit in this repository.`);
  }
}

async function hasCommits(repoPath) {
  const output = await runGit(repoPath, ['rev-parse', '--verify', '--quiet', 'HEAD'], {
    allowedExitCodes: [0, 1, 128],
  });
  return Boolean(output.trim());
}

// Results

/** A commit as the AI tool sees it: the avatar is only for the app's own list. */
function describeCommit(commit) {
  const described = { ...commit };
  delete described.avatarUrl;
  return described;
}

const describeCommits = (commits) => commits.map(describeCommit);

/** Text cut to MAX_TEXT_LENGTH, saying how much was left out and how to see it. */
const DIFF_TOO_LONG = 'Pass files_only to list the files changed, then a path to see each one.';

export function limitText(text, hint) {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  const omitted = text.length - MAX_TEXT_LENGTH;
  return `${text.slice(0, MAX_TEXT_LENGTH)}\n\n[Cut short: ${omitted.toLocaleString('en')} more characters. ${hint}]`;
}

/** `git diff --numstat -z` output, as lines added and deleted by path. */
function parseNumstat(output) {
  const fields = output.split('\0');
  const counts = new Map();
  for (let index = 0; index < fields.length; ) {
    const field = fields[index];
    index += 1;
    if (!field) continue;
    const [added, deleted, ...rest] = field.split('\t');
    let filePath = rest.join('\t');
    // A rename leaves the path empty, and gives the old and new paths as the next fields.
    if (filePath === '') {
      filePath = fields[index + 1];
      index += 2;
    }
    const binary = added === '-';
    counts.set(filePath, {
      additions: binary ? null : Number(added),
      deletions: binary ? null : Number(deleted),
      ...(binary && { binary: true }),
    });
  }
  return counts;
}

/**
 * The files a diff touches, without the patch: each one's status, its old path when
 * renamed, and lines added and deleted. `command` is the diff, such as ['diff', 'HEAD'],
 * and `pathArgs` what follows it.
 */
async function listChangedFiles(repoPath, command, pathArgs) {
  const [nameStatus, numstat] = await Promise.all(
    ['--name-status', '--numstat'].map((flag) =>
      runGitOnPaths(repoPath, [...command.slice(0, 1), flag, '-z', '-M', ...command.slice(1), ...pathArgs]),
    ),
  );
  const counts = parseNumstat(numstat);
  return parseNameStatus(nameStatus).map((file) => ({
    path: file.path,
    status: file.status,
    ...(file.originalPath && { originalPath: file.originalPath }),
    ...counts.get(file.path),
  }));
}

const FILES_ONLY = {
  type: 'boolean',
  description:
    'List the files changed, with their status and lines added and deleted, instead of the patch. Start here for a large change, then ask for each file by path.',
};

/** When the repository last fetched, so the AI tool can tell how fresh ahead and behind are. */
async function lastFetch(repoPath) {
  try {
    return await git.getLastFetchTime(repoPath);
  } catch {
    return null;
  }
}

/** The linked repositories in the group named, by name or id, or every one when none is. */
export async function repositoriesIn(store, groupName) {
  const [repositories, groups] = await Promise.all([store.list(), store.listGroups()]);
  if (!groupName) return { repositories, groups };
  const wanted = groupName.trim().toLowerCase();
  const group = groups.find((candidate) => candidate.id === groupName || candidate.name.toLowerCase() === wanted);
  if (!group) {
    const names = groups.map((candidate) => candidate.name).join(', ') || 'none';
    throw new ToolError(`There is no group called "${groupName}". The groups are: ${names}.`);
  }
  return {
    repositories: repositories.filter((repository) => groupIdsOf(repository).includes(group.id)),
    groups,
  };
}

/**
 * Commits as get_log gives them. `walk` is what to walk, such as ['HEAD'], and `follow`
 * keeps following `filePath` back through renames.
 */
export async function readLog(repoPath, { walk, filePath, follow = false, grep, author, since, limit, skip = 0 }) {
  if (!(await hasCommits(repoPath))) return [];
  const filters = [
    ...(grep ? [`--grep=${grep}`, '--regexp-ignore-case', '--fixed-strings'] : []),
    ...(author ? [`--author=${author}`] : []),
    ...(since ? [`--since=${since}`] : []),
  ];
  const [output, { remotes }] = await Promise.all([
    runGitOnPaths(repoPath, [
      'log',
      // Following renames only works in git's default order.
      ...(follow ? ['--follow'] : ['--date-order']),
      ...COMMIT_LOG_FLAGS,
      `--max-count=${limit}`,
      `--skip=${skip}`,
      ...filters,
      ...walk,
      '--',
      ...(filePath ? [filePath] : []),
    ]),
    git.getRemoteOptions(repoPath),
  ]);
  return describeCommits(parseCommits(output, remotes));
}

// Tools

/**
 * The tools offered at either level of access. All of them only read: none changes a
 * repository, its working tree, its index or its refs.
 */
export const GIT_TOOLS = [
  {
    name: 'list_repositories',
    title: 'List repositories',
    description:
      'Lists the git repositories linked in Gitty Up, each with its id, name, folder, groups, current branch, how far it is ahead of and behind its upstream, how many files have changed, its last commit, and fetchedAt: when it last fetched, which says how fresh ahead and behind are. Can be narrowed to a group, or to those with changes, or ahead, behind or on a branch. Start here: the other tools take a repository from this list.',
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'Only the repositories in this group, by name or id.' },
        dirty: { type: 'boolean', description: 'true for only those with uncommitted changes, false for only clean ones.' },
        ahead: { type: 'boolean', description: 'true for only those with commits to push, false for none to push.' },
        behind: { type: 'boolean', description: 'true for only those with commits to pull, false for none to pull.' },
        branch: { type: 'string', description: 'Only those with this branch checked out.' },
      },
    },
    async run(store, args) {
      const { repositories, groups } = await repositoriesIn(store, readString(args, 'group'));
      const dirty = readBoolean(args, 'dirty');
      const ahead = readBoolean(args, 'ahead');
      const behind = readBoolean(args, 'behind');
      const branch = readString(args, 'branch')?.trim();
      const isFiltered = [dirty, ahead, behind, branch].some((filter) => filter !== undefined);
      const groupNames = new Map(groups.map((group) => [group.id, group.name]));

      const entries = await AsyncHelper.mapWithLimit(repositories, GIT_CONCURRENCY, async (repository) => {
        const entry = {
          id: repository.id,
          name: repository.name,
          path: repository.path,
          groups: groupIdsOf(repository).flatMap((id) => groupNames.get(id) ?? []),
        };
        if (!repository.path) return { ...entry, available: false, remoteUrl: repository.remoteUrl };
        try {
          const [{ lastCommit, ...summary }, fetchedAt] = await Promise.all([
            git.getSummary(repository.path),
            lastFetch(repository.path),
          ]);
          return {
            ...entry,
            available: true,
            ...summary,
            fetchedAt,
            lastCommit: lastCommit && describeCommit(lastCommit),
          };
        } catch {
          // Moved or deleted since it was linked.
          return { ...entry, available: false };
        }
      });
      if (!isFiltered) return entries;
      const matches = (wanted, count) => wanted === undefined || wanted === count > 0;
      return entries.filter(
        (entry) =>
          entry.available &&
          matches(dirty, entry.changeCount) &&
          matches(ahead, entry.ahead) &&
          matches(behind, entry.behind) &&
          (branch === undefined || entry.branch === branch),
      );
    },
  },
  {
    name: 'get_status',
    title: 'Get status',
    description:
      'The working tree of a repository: its branch, upstream, commits ahead and behind, staged, unstaged, untracked and conflicted files, and any merge, rebase, cherry-pick or revert in progress. fetchedAt is when it last fetched: ahead and behind are only as fresh as that, and fetch brings them up to date.',
    inputSchema: {
      type: 'object',
      properties: { repository: REPOSITORY },
      required: ['repository'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const [status, fetchedAt] = await Promise.all([git.getStatus(repository.path), lastFetch(repository.path)]);
      return { ...status, fetchedAt };
    },
  },
  {
    name: 'list_branches',
    title: 'List branches',
    description:
      'The local and remote branches of a repository. Local ones say whether they are checked out, their upstream, how far ahead and behind it they are, and their last commit.',
    inputSchema: {
      type: 'object',
      properties: { repository: REPOSITORY },
      required: ['repository'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      return git.getBranches(repository.path);
    },
  },
  {
    name: 'get_log',
    title: 'Get commit history',
    description:
      'Commits of a repository, newest first, with their parents (so the commit graph can be drawn), author, date, subject and the branches and tags on them. Walks HEAD unless given a ref, or every branch and tag with all_branches. Can be narrowed to a path, a message search, an author or a date. With follow, a file\'s history goes on back through renames.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        ref: REF('Branch, tag, commit or range (such as main..feature) to walk. Defaults to HEAD.'),
        all_branches: {
          type: 'boolean',
          description: 'Walk every local and remote branch and tag instead of one ref.',
        },
        path: PATH('Only commits that touched this file or folder, relative to the repository root.'),
        follow: {
          type: 'boolean',
          description: 'path is one file: keep following it back through renames, to before it had its name.',
        },
        grep: { type: 'string', description: 'Only commits whose message contains this, ignoring case.' },
        author: { type: 'string', description: 'Only commits by an author whose name or email contains this.' },
        since: { type: 'string', description: 'Only commits from this date on, such as 2026-11-01 or "2 weeks ago".' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_LOG_LIMIT,
          description: `How many commits to return. Defaults to ${DEFAULT_LOG_LIMIT}, at most ${MAX_LOG_LIMIT}.`,
        },
        skip: { type: 'integer', minimum: 0, description: 'How many commits to pass over first, to page.' },
      },
      required: ['repository'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const ref = readRef(args, 'ref') ?? 'HEAD';
      const allBranches = readBoolean(args, 'all_branches') ?? false;
      const filePath = readRepoPath(args, 'path');
      const follow = readBoolean(args, 'follow') ?? false;
      if (follow && !filePath) throw new ToolError('"follow" needs the file to follow as path.');
      return readLog(repository.path, {
        walk: allBranches ? ALL_REFS : [ref],
        filePath,
        follow,
        grep: readString(args, 'grep'),
        author: readString(args, 'author'),
        since: readString(args, 'since'),
        limit: Math.max(1, readCount(args, 'limit', DEFAULT_LOG_LIMIT, MAX_LOG_LIMIT)),
        skip: readCount(args, 'skip', 0),
      });
    },
  },
  {
    name: 'get_commit',
    title: 'Get commit',
    description:
      'One commit: its full message, author, date, parents, the branches and tags on it, and the files it changed with how each changed. A merge is compared with its first parent.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        commit: REF('Hash, branch, tag or revision such as HEAD~2.'),
      },
      required: ['repository', 'commit'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const hash = await resolveCommit(repository.path, readRef(args, 'commit', { required: true }));
      return describeCommit(await git.getCommitDetails(repository.path, hash));
    },
  },
  {
    name: 'get_commit_diff',
    title: 'Get commit diff',
    description:
      'The patch a commit made, as a unified diff, optionally for one file or folder only, or with files_only the files it changed with lines added and deleted. A merge is compared with its first parent.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        commit: REF('Hash, branch, tag or revision such as HEAD~2.'),
        path: PATH('Only this file or folder, relative to the repository root.'),
        files_only: FILES_ONLY,
        ignore_whitespace: IGNORE_WHITESPACE,
      },
      required: ['repository', 'commit'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const hash = await resolveCommit(repository.path, readRef(args, 'commit', { required: true }));
      const filePath = readRepoPath(args, 'path');
      const parents = (await runGit(repository.path, ['log', '-1', '--format=%P', hash, '--']))
        .trim()
        .split(' ')
        .filter(Boolean);
      const range = parents.length > 0 ? [parents[0], hash] : ['--root', hash];
      const pathArgs = ['--', ...(filePath ? [filePath] : [])];
      if (readBoolean(args, 'files_only')) {
        return listChangedFiles(repository.path, ['diff-tree', '-r', '--no-commit-id', ...range], pathArgs);
      }
      const diff = await runGitOnPaths(repository.path, [
        'diff-tree',
        '-p',
        '-M',
        '--no-commit-id',
        ...diffFlags(args),
        ...range,
        '--',
        ...(filePath ? [filePath] : []),
      ]);
      return limitText(diff || 'This commit changed nothing here.', DIFF_TOO_LONG);
    },
  },
  {
    name: 'get_uncommitted_diff',
    title: 'Get uncommitted changes',
    description:
      'The changes not yet committed, as a unified diff, or with files_only the files changed with lines added and deleted: staged and unstaged together by default, or only one of them. Untracked files are not in it: get_status lists them, and read_working_file reads them.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        staged: {
          type: 'boolean',
          description: 'true for only the staged changes, false for only the unstaged ones. Leave out for both.',
        },
        path: PATH('Only this file or folder, relative to the repository root.'),
        files_only: FILES_ONLY,
        ignore_whitespace: IGNORE_WHITESPACE,
      },
      required: ['repository'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const staged = readBoolean(args, 'staged');
      const filePath = readRepoPath(args, 'path');
      // Before the first commit there is no HEAD to compare with, so everything staged is new.
      const base = (await hasCommits(repository.path)) ? ['HEAD'] : ['--cached'];
      const area = staged === undefined ? base : staged ? ['--cached'] : [];
      if (readBoolean(args, 'files_only')) {
        return listChangedFiles(repository.path, ['diff', ...area], ['--', ...(filePath ? [filePath] : [])]);
      }
      const diff = await runGitOnPaths(repository.path, [
        'diff',
        '-M',
        ...diffFlags(args),
        ...area,
        '--',
        ...(filePath ? [filePath] : []),
      ]);
      return limitText(diff || 'There are no uncommitted changes here.', DIFF_TOO_LONG);
    },
  },
  {
    name: 'compare_refs',
    title: 'Compare branches',
    description:
      'What one branch or commit has that another does not, as a pull request would show it: the commits on head since it left base, and the files changed since their merge base, with a patch if asked.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        base: REF('The branch or commit compared against, such as main.'),
        head: REF('The branch or commit with the changes. Defaults to HEAD.'),
        include_patch: { type: 'boolean', description: 'Add the full unified diff, not just the files changed.' },
        path: PATH('Only this file or folder, relative to the repository root.'),
        ignore_whitespace: IGNORE_WHITESPACE,
      },
      required: ['repository', 'base'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const base = await resolveCommit(repository.path, readRef(args, 'base', { required: true }));
      const head = await resolveCommit(repository.path, readRef(args, 'head') ?? 'HEAD');
      const filePath = readRepoPath(args, 'path');
      const pathArgs = ['--', ...(filePath ? [filePath] : [])];
      const [log, { remotes }, stat, behind] = await Promise.all([
        runGitOnPaths(repository.path, [
          'log',
          ...COMMIT_LOG_FLAGS,
          `--max-count=${MAX_LOG_LIMIT}`,
          `${base}..${head}`,
          ...pathArgs,
        ]),
        git.getRemoteOptions(repository.path),
        runGitOnPaths(repository.path, ['diff', '--stat=200', ...diffFlags(args), `${base}...${head}`, ...pathArgs]),
        runGit(repository.path, ['rev-list', '--count', `${head}..${base}`, '--']),
      ]);
      const result = {
        base,
        head,
        commits: describeCommits(parseCommits(log, remotes)),
        commitsOnBaseNotInHead: Number(behind.trim()),
        filesChanged: stat.trim() || 'No files differ.',
      };
      if (readBoolean(args, 'include_patch')) {
        const patch = await runGitOnPaths(repository.path, [
          'diff',
          '-M',
          ...diffFlags(args),
          `${base}...${head}`,
          ...pathArgs,
        ]);
        result.patch = limitText(patch, DIFF_TOO_LONG);
      }
      return result;
    },
  },
  {
    name: 'list_files',
    title: 'List files',
    description:
      'The files git tracks at a commit, branch or tag (HEAD by default), optionally inside one folder.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        ref: REF('Branch, tag or commit. Defaults to HEAD.'),
        path: PATH('Only files inside this folder, relative to the repository root.'),
      },
      required: ['repository'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const commit = await resolveCommit(repository.path, readRef(args, 'ref') ?? 'HEAD');
      const folder = readRepoPath(args, 'path');
      const output = await runGitOnPaths(repository.path, [
        'ls-tree',
        '-r',
        '--name-only',
        '-z',
        '--full-tree',
        commit,
        '--',
        ...(folder ? [folder] : []),
      ]);
      const files = output.split('\0').filter(Boolean);
      return {
        commit,
        count: files.length,
        files: files.slice(0, MAX_LISTED_FILES),
        ...(files.length > MAX_LISTED_FILES && {
          note: `Only the first ${MAX_LISTED_FILES} are listed. Pass a folder as path to see the rest.`,
        }),
      };
    },
  },
  {
    name: 'read_file',
    title: 'Read file',
    description:
      'The contents of a file as committed at a commit, branch or tag (HEAD by default), whole or from start_line to end_line. Reads what git has stored: read_working_file reads the file on disk, uncommitted changes and all.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        path: PATH('The file, relative to the repository root.'),
        ref: REF('Branch, tag or commit. Defaults to HEAD.'),
        ...LINE_RANGE,
      },
      required: ['repository', 'path'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const commit = await resolveCommit(repository.path, readRef(args, 'ref') ?? 'HEAD');
      const filePath = readRepoPath(args, 'path', { required: true });
      const object = `${commit}:${filePath}`;
      const type = await runGit(repository.path, ['cat-file', '-t', object], {
        allowedExitCodes: [0, 128],
      });
      if (type.trim() !== 'blob') {
        throw new ToolError(
          type.trim() === 'tree'
            ? `${filePath} is a folder. Use list_files to see what is in it.`
            : `${filePath} is not in ${commit.slice(0, 7)}.`,
        );
      }
      const content = await runGit(repository.path, ['cat-file', 'blob', object]);
      if (content.includes('\0')) return `${filePath} is a binary file, so it is not shown.`;
      return limitText(sliceLines(content, args), 'The rest is not shown. Pass start_line and end_line to read it.');
    },
  },
  {
    name: 'list_tags',
    title: 'List tags',
    description: 'The tags of a repository, newest first, with the commit each points at.',
    inputSchema: {
      type: 'object',
      properties: { repository: REPOSITORY },
      required: ['repository'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      return git.getTags(repository.path);
    },
  },
  {
    name: 'list_stashes',
    title: 'List stashes',
    description: 'The stashes of a repository, newest first.',
    inputSchema: {
      type: 'object',
      properties: { repository: REPOSITORY },
      required: ['repository'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      return git.getStashes(repository.path);
    },
  },
  {
    name: 'list_worktrees',
    title: 'List worktrees',
    description: 'The working trees of a repository, the main one first, with the branch each has checked out.',
    inputSchema: {
      type: 'object',
      properties: { repository: REPOSITORY },
      required: ['repository'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      return git.getWorktrees(repository.path);
    },
  },
  {
    name: 'get_reflog',
    title: 'Get reflog',
    description:
      'Where HEAD, or one local branch, has pointed, newest first: each checkout, commit, amend, reset, rebase, merge and pull, with its hash and when it happened. An entry whose reachable is false is a commit that no branch, remote branch or tag holds any more: work lost to a reset, rebase, amend or deleted branch. Read one with get_commit or get_commit_diff. With full access, create_branch with start_point set to its hash recovers it without changing anything else; cherry_pick, checkout_commit and reset can also use it.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        branch: REF(
          "A local branch whose own reflog to read. Leave out for HEAD's, which also has the commits of deleted branches.",
        ),
        lost_only: {
          type: 'boolean',
          description: 'Only the entries whose commit is on no branch or tag, out of those read.',
        },
        limit: {
          type: 'integer',
          description: `How many entries to read, newest first. Defaults to ${DEFAULT_LOG_LIMIT}, at most ${MAX_LOG_LIMIT}.`,
        },
      },
      required: ['repository'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const entries = await git.getReflog(repository.path, {
        ref: readRef(args, 'branch') ?? 'HEAD',
        limit: Math.max(readCount(args, 'limit', DEFAULT_LOG_LIMIT, MAX_LOG_LIMIT), 1),
      });
      return readBoolean(args, 'lost_only') ? entries.filter((entry) => !entry.reachable) : entries;
    },
  },
  {
    name: 'list_pull_requests',
    title: 'List pull requests',
    description:
      "The open pull requests (merge requests on GitLab) on the repository's default remote, when it is on github.com, gitlab.com or bitbucket.org: number, title, link, branch and whether it is a draft. On GitHub with a token, review is the review decision and checks whether its checks pass. A list is reused for a minute. Another host, or one that can't be reached, gives an empty list.",
    // It asks the hosting service, over the network.
    openWorld: true,
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        branch: { type: 'string', description: 'Only the pull request for this branch, as named on the remote.' },
      },
      required: ['repository'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const branch = readString(args, 'branch')?.trim();
      const pullRequests = await git.getPullRequests(repository.path);
      return branch ? pullRequests.filter((pullRequest) => pullRequest.branch === branch) : pullRequests;
    },
  },
];

for (const tool of GIT_TOOLS) {
  // Tells the AI tool that calling these is safe, so it need not ask before each one.
  tool.annotations = {
    title: tool.title,
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: Boolean(tool.openWorld),
  };
}
