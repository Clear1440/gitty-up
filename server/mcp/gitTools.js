import path from 'node:path';
import * as git from '../git/gitService.js';
import { COMMIT_LOG_FLAGS, parseCommits } from '../git/parsers.js';
import { GIT_CONCURRENCY, runGit, runGitOnPaths } from '../git/runGit.js';
import { groupIdsOf } from '../store/repositoryStore.js';
import { AsyncHelper } from '../utils/AsyncHelper.js';

/** Longer text is cut short, so one huge diff can't flood the AI tool's context. */
export const MAX_TEXT_LENGTH = 100_000;
const DEFAULT_LOG_LIMIT = 50;
const MAX_LOG_LIMIT = 500;
const MAX_LISTED_FILES = 5_000;

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

function readCount(args, name, fallback, max = Number.MAX_SAFE_INTEGER) {
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
export function limitText(text, hint) {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  const omitted = text.length - MAX_TEXT_LENGTH;
  return `${text.slice(0, MAX_TEXT_LENGTH)}\n\n[Cut short: ${omitted.toLocaleString('en')} more characters. ${hint}]`;
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
      'Lists the git repositories linked in Gitty Up, each with its id, name, folder, groups, current branch, how far it is ahead of and behind its upstream, how many files have changed and its last commit. Start here: the other tools take a repository from this list.',
    inputSchema: { type: 'object', properties: {} },
    async run(store) {
      const [repositories, groups] = await Promise.all([store.list(), store.listGroups()]);
      const groupNames = new Map(groups.map((group) => [group.id, group.name]));
      return AsyncHelper.mapWithLimit(repositories, GIT_CONCURRENCY, async (repository) => {
        const entry = {
          id: repository.id,
          name: repository.name,
          path: repository.path,
          groups: groupIdsOf(repository).flatMap((id) => groupNames.get(id) ?? []),
        };
        if (!repository.path) return { ...entry, available: false, remoteUrl: repository.remoteUrl };
        try {
          const { lastCommit, ...summary } = await git.getSummary(repository.path);
          return {
            ...entry,
            available: true,
            ...summary,
            lastCommit: lastCommit && describeCommit(lastCommit),
          };
        } catch {
          // Moved or deleted since it was linked.
          return { ...entry, available: false };
        }
      });
    },
  },
  {
    name: 'get_status',
    title: 'Get status',
    description:
      'The working tree of a repository: its branch, upstream, commits ahead and behind, staged, unstaged, untracked and conflicted files, and any merge, rebase, cherry-pick or revert in progress.',
    inputSchema: {
      type: 'object',
      properties: { repository: REPOSITORY },
      required: ['repository'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      return git.getStatus(repository.path);
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
      'Commits of a repository, newest first, with their parents (so the commit graph can be drawn), author, date, subject and the branches and tags on them. Walks HEAD unless given a ref, or every branch and tag with all_branches. Can be narrowed to a path, a message search or an author.',
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
        grep: { type: 'string', description: 'Only commits whose message contains this, ignoring case.' },
        author: { type: 'string', description: 'Only commits by an author whose name or email contains this.' },
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
      const grep = readString(args, 'grep');
      const author = readString(args, 'author');
      const limit = Math.max(1, readCount(args, 'limit', DEFAULT_LOG_LIMIT, MAX_LOG_LIMIT));
      const skip = readCount(args, 'skip', 0);
      if (!(await hasCommits(repository.path))) return [];

      const walk = allBranches ? ['--branches', '--remotes', '--tags', 'HEAD'] : [ref];
      const filters = [
        ...(grep ? [`--grep=${grep}`, '--regexp-ignore-case', '--fixed-strings'] : []),
        ...(author ? [`--author=${author}`] : []),
      ];
      const [output, { remotes }] = await Promise.all([
        runGitOnPaths(repository.path, [
          'log',
          '--date-order',
          ...COMMIT_LOG_FLAGS,
          `--max-count=${limit}`,
          `--skip=${skip}`,
          ...filters,
          ...walk,
          '--',
          ...(filePath ? [filePath] : []),
        ]),
        git.getRemoteOptions(repository.path),
      ]);
      return describeCommits(parseCommits(output, remotes));
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
      'The patch a commit made, as a unified diff, optionally for one file or folder only. A merge is compared with its first parent.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        commit: REF('Hash, branch, tag or revision such as HEAD~2.'),
        path: PATH('Only this file or folder, relative to the repository root.'),
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
      return limitText(diff || 'This commit changed nothing here.', 'Pass a path to see one file.');
    },
  },
  {
    name: 'get_uncommitted_diff',
    title: 'Get uncommitted changes',
    description:
      'The changes not yet committed, as a unified diff: staged and unstaged together by default, or only one of them. Untracked files are not in it: get_status lists them, and read_file cannot read them.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        staged: {
          type: 'boolean',
          description: 'true for only the staged changes, false for only the unstaged ones. Leave out for both.',
        },
        path: PATH('Only this file or folder, relative to the repository root.'),
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
      const diff = await runGitOnPaths(repository.path, [
        'diff',
        '-M',
        ...diffFlags(args),
        ...area,
        '--',
        ...(filePath ? [filePath] : []),
      ]);
      return limitText(diff || 'There are no uncommitted changes here.', 'Pass a path to see one file.');
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
        result.patch = limitText(patch, 'Pass a path to see one file.');
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
      'The contents of a file as committed at a commit, branch or tag (HEAD by default). Reads what git has stored, never the working tree.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        path: PATH('The file, relative to the repository root.'),
        ref: REF('Branch, tag or commit. Defaults to HEAD.'),
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
      return limitText(content, 'The rest of the file is not shown.');
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
