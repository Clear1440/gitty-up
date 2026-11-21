import fs from 'node:fs/promises';
import path from 'node:path';
import * as git from '../git/gitService.js';
import { GIT_CONCURRENCY, runGit, runGitOnPaths } from '../git/runGit.js';
import { describeScript, loadGittyConfig } from '../scripts/gittyConfig.js';
import { AsyncHelper } from '../utils/AsyncHelper.js';
import {
  ALL_REFS,
  LINE_RANGE,
  MAX_TEXT_LENGTH,
  PATH,
  REF,
  REPOSITORY,
  ToolError,
  findRepository,
  limitText,
  readBoolean,
  readCount,
  readLineNumber,
  readLog,
  readRef,
  readRepoPath,
  readString,
  repositoriesIn,
  resolveCommit,
  sliceLines,
} from './gitTools.js';

const DEFAULT_MATCHES = 100;
const MAX_MATCHES = 1_000;
/** A matching line longer than this is cut, as minified code can put a whole file on one. */
const MAX_MATCH_LENGTH = 300;
const MAX_BLAME_LINES = 2_000;
const DEFAULT_ACROSS_LIMIT = 20;
const MAX_ACROSS_LIMIT = 100;
/** A working file bigger than this is not read: it is almost certainly not source. */
const MAX_WORKING_FILE_BYTES = 10 * 1024 * 1024;
const MAX_CONFLICT_REGIONS = 20;
const MAX_CONFLICT_SIDE_LENGTH = 2_000;
/** Each version of a conflicted file gets a share of the usual limit, as there are four. */
const MAX_CONFLICT_VERSION_LENGTH = MAX_TEXT_LENGTH / 4;
const UNCOMMITTED_HASH = /^0{40}$/;

const short = (hash) => hash.slice(0, 7);
const cutLine = (text) => (text.length > MAX_MATCH_LENGTH ? `${text.slice(0, MAX_MATCH_LENGTH)}…` : text);

/** A file inside the repository's working tree, refusing anything that leads out of it. */
async function workingFilePath(repoPath, filePath) {
  if (filePath.split('/')[0] === '.git') throw new ToolError('Files inside .git are not read.');
  const root = await fs.realpath(repoPath);
  const target = await fs.realpath(path.join(root, filePath)).catch(() => null);
  if (!target) throw new ToolError(`${filePath} does not exist in the working tree.`);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ToolError(`${filePath} leads outside the repository, so it is not read.`);
  }
  return target;
}

/** Whether git ignores the file, as it does build output and files like .env. */
async function isIgnored(repoPath, filePath) {
  // check-ignore takes no pathspec magic, so this can't go through runGitOnPaths.
  const output = await runGit(repoPath, ['check-ignore', '--', filePath], { allowedExitCodes: [0, 1] });
  return output.trim() !== '';
}

/** Parses `git grep -n -z` output, dropping the `<commit>:` git puts before each path. */
function parseGrep(output, commit, max) {
  const prefix = commit ? `${commit}:` : '';
  const matches = [];
  let total = 0;
  for (const record of output.split('\n')) {
    if (!record) continue;
    total += 1;
    if (matches.length >= max) continue;
    const [file, line, ...text] = record.split('\0');
    matches.push({
      path: file.startsWith(prefix) ? file.slice(prefix.length) : file,
      line: Number(line),
      text: cutLine(text.join('\0')),
    });
  }
  return { matches, total };
}

/**
 * Parses `git blame --porcelain`: a header line per source line, the commit's details the
 * first time it appears, then the line itself after a tab. Consecutive lines from one
 * commit become one hunk.
 */
function parseBlame(output) {
  const commits = new Map();
  const hunks = [];
  let current = null;
  let lineNumber = 0;
  for (const line of output.split('\n')) {
    const header = /^([0-9a-f]{40}) \d+ (\d+)/.exec(line);
    if (header) {
      current = header[1];
      lineNumber = Number(header[2]);
      if (!commits.has(current)) commits.set(current, {});
    } else if (line.startsWith('\t') && current) {
      const last = hunks.at(-1);
      if (last?.hash === current && last.end === lineNumber - 1) {
        last.end = lineNumber;
        last.lines.push(line.slice(1));
      } else {
        hunks.push({ hash: current, start: lineNumber, end: lineNumber, lines: [line.slice(1)] });
      }
    } else if (current) {
      const space = line.indexOf(' ');
      const key = space === -1 ? line : line.slice(0, space);
      commits.get(current)[key] = space === -1 ? true : line.slice(space + 1);
    }
  }
  return hunks.map(({ hash, start, end, lines }) => {
    if (UNCOMMITTED_HASH.test(hash)) return { start, end, commit: null, uncommitted: true, text: lines.join('\n') };
    const info = commits.get(hash);
    return {
      start,
      end,
      commit: short(hash),
      author: info.author,
      date: new Date(Number(info['author-time']) * 1000).toISOString(),
      subject: info.summary,
      text: lines.join('\n'),
    };
  });
}

/**
 * What a merge commit's message says about where it came from: the branch it merged and,
 * when the host wrote it, the pull request number. GitHub, GitLab and Bitbucket each word
 * it their own way.
 */
export function readMergeMessage(message) {
  const [subject = '', ...rest] = message.split('\n');
  const body = rest.join('\n');
  const github = /^Merge pull request #(\d+) from (\S+)/.exec(subject);
  if (github) {
    // GitHub names the branch as owner/branch.
    const source = github[2].includes('/') ? github[2].slice(github[2].indexOf('/') + 1) : github[2];
    return { sourceBranch: source, pullRequest: Number(github[1]) };
  }
  const bitbucket = /^Merged in (\S+) \(pull request #(\d+)\)/.exec(subject);
  if (bitbucket) return { sourceBranch: bitbucket[1], pullRequest: Number(bitbucket[2]) };
  const branch = /^Merge (?:remote-tracking )?branch '([^']+)'/.exec(subject);
  const gitlab = /See merge request \S+!(\d+)/.exec(body);
  const squash = /\(#(\d+)\)$/.exec(subject.trim());
  return {
    sourceBranch: branch?.[1] ?? null,
    pullRequest: gitlab ? Number(gitlab[1]) : squash ? Number(squash[1]) : null,
  };
}

async function describePullRequest(repoPath, number) {
  if (!number) return null;
  const url = await git.getPullRequestUrl(repoPath, number).catch(() => null);
  return { number, ...(url && { url }) };
}

/** The commits that descend from `hash` on the way to `tip`, as a set of full hashes. */
async function descendantsOf(repoPath, hash, tip) {
  const output = await runGit(repoPath, ['rev-list', '--ancestry-path', `${hash}..${tip}`, '--']);
  return new Set(output.split('\n').filter(Boolean));
}

/**
 * The conflicts in a working file, from its markers: where each starts, and what each side
 * has there. The base shows only when git was set to write it (merge.conflictStyle diff3).
 */
function readConflictRegions(text) {
  const regions = [];
  let region = null;
  let side = null;
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (line.startsWith('<<<<<<<')) {
      region = { line: index + 1, ours: [], base: null, theirs: [] };
      side = 'ours';
    } else if (region && line.startsWith('|||||||')) {
      region.base = [];
      side = 'base';
    } else if (region && line.startsWith('=======')) {
      side = 'theirs';
    } else if (region && line.startsWith('>>>>>>>')) {
      regions.push(region);
      region = null;
    } else if (region) {
      region[side].push(line);
    }
  });
  const cut = (sideLines) => {
    const joined = sideLines.join('\n');
    return joined.length > MAX_CONFLICT_SIDE_LENGTH ? `${joined.slice(0, MAX_CONFLICT_SIDE_LENGTH)}…` : joined;
  };
  return regions.map(({ line, ours, base, theirs }) => ({
    line,
    ours: cut(ours),
    ...(base && { base: cut(base) }),
    theirs: cut(theirs),
  }));
}

const cutVersion = (text) =>
  text === null || text.length <= MAX_CONFLICT_VERSION_LENGTH
    ? text
    : `${text.slice(0, MAX_CONFLICT_VERSION_LENGTH)}\n[Cut short.]`;

/**
 * Parses `git merge-tree --write-tree -z --name-only`: the tree, the conflicted paths up
 * to an empty field, then a record per message: how many paths, the paths, its type and
 * the message itself.
 */
function parseMergeTree(output) {
  const fields = output.split('\0');
  let index = 1;
  const conflicted = [];
  while (index < fields.length && fields[index] !== '') conflicted.push(fields[index++]);
  index += 1;
  const types = new Map();
  while (index < fields.length - 1) {
    const count = Number(fields[index]);
    if (!Number.isInteger(count) || count < 1) break;
    const paths = fields.slice(index + 1, index + 1 + count);
    const type = fields[index + 1 + count];
    index += count + 3;
    if (!type?.startsWith('CONFLICT')) continue;
    for (const conflictPath of paths) if (!types.has(conflictPath)) types.set(conflictPath, type);
  }
  return [...new Set(conflicted)].map((conflictPath) => ({ path: conflictPath, type: types.get(conflictPath) ?? 'CONFLICT' }));
}

/** Runs `read` on each repository with a folder, keeping the ones that give something back. */
async function acrossRepositories(repositories, read) {
  const results = await AsyncHelper.mapWithLimit(
    repositories.filter((repository) => repository.path),
    GIT_CONCURRENCY,
    async (repository) => {
      const label = { id: repository.id, name: repository.name };
      try {
        const found = await read(repository);
        return found && { repository: label, ...found };
      } catch (error) {
        return { repository: label, error: error.message };
      }
    },
  );
  return results.filter(Boolean);
}

const BRANCH_FIELDS = ({ name, isCurrent, upstream, ahead, behind, upstreamGone, lastCommit }) => ({
  name,
  ...(isCurrent && { checkedOut: true }),
  upstream,
  ahead,
  behind,
  ...(upstreamGone && { upstreamGone: true }),
  lastCommit,
});

/**
 * More tools that only read, for the questions agents ask most: where code is, who wrote
 * a line, which pull request brought a commit in, what is going on across a group of
 * repositories, what a merge would do, and what a conflict is about.
 */
export const GIT_INSIGHT_TOOLS = [
  {
    name: 'search_code',
    title: 'Search code',
    description:
      'Finds the lines that contain some text in the files git tracks at a commit, branch or tag (HEAD by default), as git grep does, with each match\'s file and line number. With working_tree, searches the files on disk instead, uncommitted changes and untracked files included. Binary files are skipped. Read around a match with read_file or read_working_file and start_line.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        pattern: { type: 'string', description: 'The text to find. Taken literally unless regex is true.' },
        regex: { type: 'boolean', description: 'pattern is an extended regular expression.' },
        ignore_case: { type: 'boolean', description: 'Match regardless of case.' },
        path: PATH('Only inside this file or folder, relative to the repository root.'),
        ref: REF('Branch, tag or commit to search. Defaults to HEAD.'),
        working_tree: { type: 'boolean', description: 'Search the files on disk instead of a commit.' },
        max_results: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_MATCHES,
          description: `How many matches to return. Defaults to ${DEFAULT_MATCHES}, at most ${MAX_MATCHES}.`,
        },
      },
      required: ['repository', 'pattern'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const pattern = readString(args, 'pattern', { required: true });
      const workingTree = readBoolean(args, 'working_tree') ?? false;
      const ref = readRef(args, 'ref');
      if (workingTree && ref) throw new ToolError('Pass ref or working_tree, not both.');
      const commit = workingTree ? null : await resolveCommit(repository.path, ref ?? 'HEAD');
      const folder = readRepoPath(args, 'path');
      const max = Math.max(1, readCount(args, 'max_results', DEFAULT_MATCHES, MAX_MATCHES));
      // Exit code 1 is git grep finding nothing.
      const output = await runGitOnPaths(
        repository.path,
        [
          'grep',
          '-n',
          '-z',
          '-I',
          '--no-color',
          '--full-name',
          readBoolean(args, 'regex') ? '-E' : '-F',
          ...(readBoolean(args, 'ignore_case') ? ['-i'] : []),
          ...(workingTree ? ['--untracked'] : []),
          '-e',
          pattern,
          ...(commit ? [commit] : []),
          '--',
          ...(folder ? [folder] : []),
        ],
        { allowedExitCodes: [0, 1] },
      );
      const { matches, total } = parseGrep(output, commit, max);
      return {
        searched: commit ?? 'working tree',
        count: total,
        files: new Set(matches.map((match) => match.path)).size,
        matches,
        ...(total > matches.length && {
          note: `Only the first ${matches.length} of ${total} matches are listed. Narrow it with path, or raise max_results.`,
        }),
      };
    },
  },
  {
    name: 'blame',
    title: 'Blame',
    description:
      'Who last changed each line of a file, and in which commit: the file in runs of lines, each with its commit, author, date and subject. At a commit, branch or tag (HEAD by default), or with working_tree the file on disk, where uncommitted lines show as uncommitted. Narrow it with start_line and end_line. get_commit then tells the whole story of a commit, and find_merge which pull request brought it in.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        path: PATH('The file, relative to the repository root.'),
        ref: REF('Branch, tag or commit. Defaults to HEAD.'),
        working_tree: { type: 'boolean', description: 'Blame the file on disk, uncommitted changes included.' },
        ...LINE_RANGE,
        ignore_whitespace: {
          type: 'boolean',
          description: 'Look past commits that only changed spaces and tabs, such as reindenting.',
        },
      },
      required: ['repository', 'path'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const filePath = readRepoPath(args, 'path', { required: true });
      const workingTree = readBoolean(args, 'working_tree') ?? false;
      const ref = readRef(args, 'ref');
      if (workingTree && ref) throw new ToolError('Pass ref or working_tree, not both.');
      const commit = workingTree ? null : await resolveCommit(repository.path, ref ?? 'HEAD');
      const start = readLineNumber(args, 'start_line');
      const end = readLineNumber(args, 'end_line');
      if (start && end && end < start) throw new ToolError('"end_line" must not come before "start_line".');
      const range = start || end ? ['-L', `${start ?? 1},${end ?? ''}`] : [];
      let output;
      try {
        output = await runGitOnPaths(repository.path, [
          'blame',
          '--porcelain',
          ...(readBoolean(args, 'ignore_whitespace') ? ['-w'] : []),
          ...range,
          ...(commit ? [commit] : []),
          '--',
          filePath,
        ]);
      } catch (error) {
        throw new ToolError(`Could not blame ${filePath}: ${error.message}`);
      }
      const hunks = parseBlame(output);
      let shown = 0;
      const kept = hunks.filter((hunk) => {
        shown += hunk.end - hunk.start + 1;
        return shown - (hunk.end - hunk.start + 1) < MAX_BLAME_LINES;
      });
      return {
        path: filePath,
        blamed: commit ?? 'working tree',
        hunks: kept,
        ...(kept.length < hunks.length && {
          note: `Only about the first ${MAX_BLAME_LINES} lines are shown. Pass start_line and end_line for the rest.`,
        }),
      };
    },
  },
  {
    name: 'find_merge',
    title: 'Find the merge that brought a commit in',
    description:
      'How a commit reached a branch (the checked out one by default): the merge commit that brought it onto the branch, the branch that was merged, and the pull request number and link when the merge message names one. A commit made on the branch itself, fast-forwarded onto it or squash merged into it says so instead. Answers "which pull request or branch did this come from?".',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        commit: REF('Hash, tag or revision of the commit to trace.'),
        branch: REF('The branch it was merged into, such as main. Defaults to HEAD.'),
      },
      required: ['repository', 'commit'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const repoPath = repository.path;
      const branch = readRef(args, 'branch') ?? 'HEAD';
      const hash = await resolveCommit(repoPath, readRef(args, 'commit', { required: true }));
      const tip = await resolveCommit(repoPath, branch);
      const base = (await runGit(repoPath, ['merge-base', hash, tip], { allowedExitCodes: [0, 1] })).trim();
      if (base !== hash) throw new ToolError(`${short(hash)} is not on ${branch}.`);

      const commit = await git.getCommitDetails(repoPath, hash);
      const describe = ({ hash: full, subject, author, date }) => ({ hash: full, subject, author, date });
      const direct = async () => {
        const { pullRequest } = readMergeMessage(commit.message ?? commit.subject ?? '');
        return {
          commit: describe(commit),
          branch,
          how: pullRequest ? 'squash merged, or committed straight onto the branch' : 'committed straight onto the branch, or fast-forwarded onto it',
          pullRequest: await describePullRequest(repoPath, pullRequest),
        };
      };
      if (hash === tip) return direct();

      const [mainline, descendants] = await Promise.all([
        runGit(repoPath, ['rev-list', '--first-parent', `${hash}..${tip}`, '--']),
        descendantsOf(repoPath, hash, tip),
      ]);
      // The oldest commit on the branch's own line that holds the commit.
      const arrival = mainline
        .split('\n')
        .filter((candidate) => descendants.has(candidate))
        .at(-1);
      const [firstParent, ...otherParents] = (await runGit(repoPath, ['log', '-1', '--format=%P', arrival, '--']))
        .trim()
        .split(' ');
      if (firstParent === hash || otherParents.length === 0) return direct();

      const merge = await git.getCommitDetails(repoPath, arrival);
      const { sourceBranch, pullRequest } = readMergeMessage(merge.message ?? merge.subject ?? '');
      const broughtIn = await runGit(repoPath, ['rev-list', '--count', `${firstParent}..${arrival}`, '--']);
      return {
        commit: describe(commit),
        branch,
        how: 'merged',
        merge: describe(merge),
        sourceBranch,
        pullRequest: await describePullRequest(repoPath, pullRequest),
        // Less the merge commit itself.
        commitsInMerge: Number(broughtIn.trim()) - 1,
      };
    },
  },
  {
    name: 'search_log_across',
    title: 'Search history across repositories',
    description:
      'Searches the commit history of every repository, or those in one group, at once: by message, author or date. Answers questions like "everything for US2638 in every service". Lists only the repositories with matches, each with its commits newest first.',
    inputSchema: {
      type: 'object',
      properties: {
        grep: { type: 'string', description: 'Only commits whose message contains this, ignoring case.' },
        author: { type: 'string', description: 'Only commits by an author whose name or email contains this.' },
        since: { type: 'string', description: 'Only commits from this date on, such as 2026-11-01 or "2 weeks ago".' },
        group: { type: 'string', description: 'Only the repositories in this group, by name or id.' },
        all_branches: {
          type: 'boolean',
          description: 'Search every local and remote branch and tag, which is the default. false for the checked out branch only.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_ACROSS_LIMIT,
          description: `How many commits per repository. Defaults to ${DEFAULT_ACROSS_LIMIT}, at most ${MAX_ACROSS_LIMIT}.`,
        },
      },
    },
    async run(store, args) {
      const grep = readString(args, 'grep');
      const author = readString(args, 'author');
      const since = readString(args, 'since');
      if (!grep && !author && !since) throw new ToolError('Say what to look for with grep, author or since.');
      const { repositories } = await repositoriesIn(store, readString(args, 'group'));
      const walk = (readBoolean(args, 'all_branches') ?? true) ? ALL_REFS : ['HEAD'];
      const limit = Math.max(1, readCount(args, 'limit', DEFAULT_ACROSS_LIMIT, MAX_ACROSS_LIMIT));
      const found = await acrossRepositories(repositories, async (repository) => {
        const commits = await readLog(repository.path, { walk, grep, author, since, limit });
        return commits.length > 0 && { commits };
      });
      return { searched: repositories.length, repositories: found };
    },
  },
  {
    name: 'find_branch_across',
    title: 'Find a branch across repositories',
    description:
      'Which repositories, of all of them or one group, have a branch whose name contains some text, local or on a remote: for each, the matching branches with how far ahead and behind their upstream they are, and which branch is checked out. Answers "which services have a branch for this story, and where does each stand?".',
    inputSchema: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Text in the branch name, ignoring case, such as us2638.' },
        exact: { type: 'boolean', description: 'Only branches named exactly this.' },
        group: { type: 'string', description: 'Only the repositories in this group, by name or id.' },
      },
      required: ['branch'],
    },
    async run(store, args) {
      const wanted = readString(args, 'branch', { required: true }).trim();
      const exact = readBoolean(args, 'exact') ?? false;
      const matches = (name) =>
        name && (exact ? name === wanted : name.toLowerCase().includes(wanted.toLowerCase()));
      const { repositories } = await repositoriesIn(store, readString(args, 'group'));
      const found = await acrossRepositories(repositories, async (repository) => {
        const { local, remote } = await git.getBranches(repository.path);
        const localMatches = local.filter((candidate) => matches(candidate.name));
        const remoteMatches = remote.filter((candidate) => matches(candidate.localName ?? candidate.name));
        if (localMatches.length === 0 && remoteMatches.length === 0) return null;
        return {
          checkedOut: local.find((candidate) => candidate.isCurrent)?.name ?? null,
          local: localMatches.map(BRANCH_FIELDS),
          remote: remoteMatches.map(({ name, lastCommit }) => ({ name, lastCommit })),
        };
      });
      return { searched: repositories.length, repositories: found };
    },
  },
  {
    name: 'read_working_file',
    title: 'Read working file',
    description:
      'The contents of a file as it is on disk now, uncommitted changes included, untracked files too, whole or from start_line to end_line. Files git ignores, such as build output or .env, are not read, nor anything outside the repository. read_file reads a committed version instead.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        path: PATH('The file, relative to the repository root.'),
        ...LINE_RANGE,
      },
      required: ['repository', 'path'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const filePath = readRepoPath(args, 'path', { required: true });
      const target = await workingFilePath(repository.path, filePath);
      const stats = await fs.stat(target);
      if (stats.isDirectory()) throw new ToolError(`${filePath} is a folder. get_status lists what changed in it.`);
      if (await isIgnored(repository.path, filePath)) {
        throw new ToolError(`${filePath} is ignored by git, so it is not read. It may hold secrets or build output.`);
      }
      if (stats.size > MAX_WORKING_FILE_BYTES) throw new ToolError(`${filePath} is too big to read here.`);
      const content = await fs.readFile(target);
      if (content.includes(0)) return `${filePath} is a binary file, so it is not shown.`;
      return limitText(sliceLines(content.toString('utf8'), args), 'The rest is not shown. Pass start_line and end_line to read it.');
    },
  },
  {
    name: 'preview_merge',
    title: 'Preview merge',
    description:
      'What merging a branch into another (the checked out one by default) would do, without doing it: how many commits it brings in, whether it is a fast-forward, and which files would conflict and how. Also says when the merge tool would refuse, such as a branch being behind its upstream. Nothing changes.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        source: REF('The branch or commit to merge in.'),
        target: REF('The branch it goes into. Defaults to the one checked out.'),
      },
      required: ['repository', 'source'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const repoPath = repository.path;
      const source = readRef(args, 'source', { required: true });
      const current = await git.getCurrentBranch(repoPath);
      const target = readRef(args, 'target') ?? current ?? 'HEAD';
      const [sourceHash, targetHash] = await Promise.all([resolveCommit(repoPath, source), resolveCommit(repoPath, target)]);
      const { commits, fastForward } = await git.previewMerge(repoPath, { source: sourceHash, target: targetHash });
      const result = { source, target, commits, fastForward };
      if (commits === 0) return { ...result, upToDate: true, note: `${target} already has everything in ${source}.` };

      let blockedBy = null;
      try {
        await git.assertNotBehind(repoPath, [target, source]);
      } catch (error) {
        blockedBy = error.message;
      }
      if (target !== current) {
        blockedBy = [blockedBy, `merge only merges into the checked out branch, which is ${current ?? 'none (HEAD is detached)'}.`]
          .filter(Boolean)
          .join(' Also, ');
      }
      if (fastForward) return { ...result, conflicts: [], ...(blockedBy && { blockedBy }) };

      let conflicts;
      try {
        // Exit code 1 is a merge with conflicts.
        const output = await runGit(
          repoPath,
          ['merge-tree', '--write-tree', '-z', '--name-only', targetHash, sourceHash],
          { allowedExitCodes: [0, 1] },
        );
        conflicts = parseMergeTree(output);
      } catch {
        return { ...result, conflicts: null, note: 'This version of git cannot work out conflicts ahead of a merge.', ...(blockedBy && { blockedBy }) };
      }
      return { ...result, conflicts, ...(blockedBy && { blockedBy }) };
    },
  },
  {
    name: 'get_conflicts',
    title: 'Get conflicts',
    description:
      'The conflicts of the merge, rebase, cherry-pick or revert in progress. Without a path: each conflicted file with its conflicts, where each starts and what each side has there. With a path: that file whole, as the common ancestor (base), each side (ours, theirs) and the working copy with its markers. With full access, resolve_conflict settles a file, then continue_operation carries on.',
    inputSchema: {
      type: 'object',
      properties: {
        repository: REPOSITORY,
        path: PATH('One conflicted file, relative to the repository root, to see in full.'),
      },
      required: ['repository'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const repoPath = repository.path;
      const filePath = readRepoPath(args, 'path');
      const { operation, conflicted } = await git.getStatus(repoPath);
      if (conflicted.length === 0) {
        return { operation, files: [], note: operation ? 'Every conflict is resolved: continue_operation carries on.' : 'Nothing is in conflict.' };
      }
      if (filePath) {
        if (!conflicted.some((file) => file.path === filePath)) {
          throw new ToolError(`${filePath} is not in conflict. The conflicted files are: ${conflicted.map((file) => file.path).join(', ')}.`);
        }
        const versions = await git.getConflict(repoPath, { filePath });
        if (versions.binary) return { operation, path: filePath, binary: true, note: 'A binary file: resolve it by taking one side whole.' };
        return {
          operation,
          path: filePath,
          labels: versions.labels,
          base: cutVersion(versions.base),
          ours: cutVersion(versions.ours),
          theirs: cutVersion(versions.theirs),
          working: cutVersion(versions.working),
        };
      }
      const files = await Promise.all(
        conflicted.map(async ({ path: conflictPath }) => {
          const text = await fs.readFile(path.join(repoPath, conflictPath), 'utf8').catch(() => null);
          if (text === null) return { path: conflictPath, note: 'Deleted on one side: get_conflicts with this path shows both.' };
          if (text.includes('\0')) return { path: conflictPath, binary: true };
          const regions = readConflictRegions(text);
          return {
            path: conflictPath,
            conflicts: regions.slice(0, MAX_CONFLICT_REGIONS),
            ...(regions.length > MAX_CONFLICT_REGIONS && { note: `${regions.length} conflicts: pass this path to see them all.` }),
          };
        }),
      );
      return { operation, files };
    },
  },
  {
    name: 'list_scripts',
    title: 'List scripts',
    description:
      "The scripts the repository's .gitty file offers, such as tests or builds the user has set up, with what each runs and the parameters it asks for. With full access, run_script runs one.",
    inputSchema: {
      type: 'object',
      properties: { repository: REPOSITORY },
      required: ['repository'],
    },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const { found, scripts, errors } = await loadGittyConfig(repository.path);
      if (!found) return { found: false, scripts: [], note: 'This repository has no .gitty file, so no scripts.' };
      return { found, scripts: scripts.map(describeScript), ...(errors.length > 0 && { errors }) };
    },
  },
];

for (const tool of GIT_INSIGHT_TOOLS) {
  tool.annotations = { title: tool.title, readOnlyHint: true, destructiveHint: false, openWorldHint: false };
}
