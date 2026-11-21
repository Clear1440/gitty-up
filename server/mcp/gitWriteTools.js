import path from 'node:path';
import * as git from '../git/gitService.js';
import {
  REF,
  REPOSITORY,
  ToolError,
  findRepository,
  readBoolean,
  readRef,
  readRepoPath,
  readString,
  resolveCommit,
} from './gitTools.js';

const PULL_MODES = ['merge', 'rebase', 'ff-only'];
const RESET_MODES = ['soft', 'hard'];
const STASH_REF = {
  type: 'string',
  description: 'The stash, as list_stashes names it, such as stash@{0}. Defaults to the latest.',
};
const PATHS = (description) => ({ type: 'array', items: { type: 'string' }, description });

/** Paths inside the repository, or undefined when left out. */
function readPaths(args, name, { required = false } = {}) {
  const value = args[name];
  if (value === undefined || value === null) {
    if (required) throw new ToolError(`"${name}" is required.`);
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new ToolError(`"${name}" must be a non-empty list of paths.`);
  }
  return value.map((item) => readRepoPath({ [name]: item }, name, { required: true }));
}

function readChoice(args, name, choices, fallback) {
  const value = readString(args, name) ?? fallback;
  if (!choices.includes(value)) {
    throw new ToolError(`"${name}" must be one of ${choices.map((choice) => `"${choice}"`).join(', ')}.`);
  }
  return value;
}

const readStashRef = (args) => readString(args, 'stash')?.trim() ?? 'stash@{0}';

/** Where the repository stands after a change, so the AI tool needn't ask straight after. */
async function describeState(repoPath) {
  const summary = await git.getSummary(repoPath);
  if (summary.lastCommit) {
    const { hash, shortHash, subject, author, date } = summary.lastCommit;
    summary.lastCommit = { hash, shortHash, subject, author, date };
  }
  return summary;
}

/**
 * A tool that changes a repository. `run` gets the repository's folder and the
 * arguments, and resolves with what to report, if more than "Done." is worth saying.
 * `destructive` marks those that can lose work, `network` those that reach a remote.
 */
function writeTool({ name, title, description, properties = {}, required = [], destructive = false, network = false, run }) {
  return {
    name,
    title,
    description,
    inputSchema: {
      type: 'object',
      properties: { repository: REPOSITORY, ...properties },
      required: ['repository', ...required],
    },
    annotations: { title, readOnlyHint: false, destructiveHint: destructive, openWorldHint: network },
    async run(store, args) {
      const repository = await findRepository(store, args);
      const outcome = await run(repository.path, args);
      return { done: outcome ?? 'Done.', state: await describeState(repository.path) };
    },
  };
}

/**
 * The tools that change repositories, offered only when the MCP server has full access.
 * Each goes through gitService, so it gets the same checks as the app's own buttons.
 */
export const GIT_WRITE_TOOLS = [
  writeTool({
    name: 'fetch',
    title: 'Fetch',
    description: 'Fetches every remote, pruning remote branches that are gone. Changes no local branch.',
    network: true,
    async run(repoPath) {
      const { changed } = await git.fetchAll(repoPath);
      return changed ? 'Fetched new commits or branches.' : 'Already up to date.';
    },
  }),
  writeTool({
    name: 'pull',
    title: 'Pull',
    description: 'Pulls the checked out branch from its upstream. Stops on conflicts, which get_status then lists.',
    properties: {
      mode: { type: 'string', enum: PULL_MODES, description: 'How to bring the commits in. Defaults to merge.' },
    },
    network: true,
    run: (repoPath, args) => git.pull(repoPath, { mode: readChoice(args, 'mode', PULL_MODES, 'merge') }),
  }),
  writeTool({
    name: 'push',
    title: 'Push',
    description:
      'Pushes the checked out branch. A branch with no upstream is published under its own name, or upstream_name, and starts tracking it. Never forces: if the remote branch has commits this one lacks, git refuses, and the user has to sort that out.',
    properties: {
      remote: { type: 'string', description: 'The remote to publish to, when the branch has no upstream yet.' },
      upstream_name: { type: 'string', description: 'Publish under this branch name instead.' },
    },
    network: true,
    run(repoPath, args) {
      // Overwriting a remote branch can throw away other people's work, so it is left to the user.
      if (args.force !== undefined && args.force !== false) {
        throw new ToolError('Force pushing is not available through MCP. Ask the user to do it in Gitty Up.');
      }
      return git.push(repoPath, {
        remote: readString(args, 'remote'),
        upstreamName: readString(args, 'upstream_name'),
        force: false,
      });
    },
  }),
  writeTool({
    name: 'checkout',
    title: 'Check out branch',
    description:
      'Switches to a branch. With remote, switches to a remote branch such as origin/feature, through a local branch that tracks it.',
    properties: {
      branch: { type: 'string', description: 'The branch to switch to.' },
      remote: { type: 'boolean', description: 'branch is a remote branch, such as origin/feature.' },
    },
    required: ['branch'],
    run: (repoPath, args) =>
      git.checkout(repoPath, {
        branch: readRef(args, 'branch', { required: true }),
        remote: readBoolean(args, 'remote') ?? false,
      }),
  }),
  writeTool({
    name: 'checkout_commit',
    title: 'Check out commit',
    description: 'Checks out a commit on its own, leaving HEAD detached from any branch.',
    properties: { commit: REF('Hash, tag or revision such as HEAD~2.') },
    required: ['commit'],
    async run(repoPath, args) {
      const hash = await resolveCommit(repoPath, readRef(args, 'commit', { required: true }));
      await git.checkoutCommit(repoPath, { hash });
    },
  }),
  writeTool({
    name: 'create_branch',
    title: 'Create branch',
    description: 'Creates a branch, and switches to it unless switch_to is false.',
    properties: {
      name: { type: 'string', description: 'The new branch name.' },
      start_point: REF('Branch, tag or commit to start from. Defaults to HEAD.'),
      switch_to: { type: 'boolean', description: 'Switch to the new branch. Defaults to true.' },
    },
    required: ['name'],
    run: (repoPath, args) =>
      git.createBranch(repoPath, {
        name: readRef(args, 'name', { required: true }),
        startPoint: readRef(args, 'start_point') ?? 'HEAD',
        switchTo: readBoolean(args, 'switch_to') ?? true,
      }),
  }),
  writeTool({
    name: 'rename_branch',
    title: 'Rename branch',
    description: 'Renames a local branch. It keeps its history and upstream.',
    properties: {
      name: { type: 'string', description: 'The branch to rename.' },
      new_name: { type: 'string', description: 'Its new name.' },
    },
    required: ['name', 'new_name'],
    run: (repoPath, args) =>
      git.renameBranch(repoPath, {
        name: readRef(args, 'name', { required: true }),
        newName: readRef(args, 'new_name', { required: true }),
      }),
  }),
  writeTool({
    name: 'delete_branch',
    title: 'Delete branch',
    description:
      'Deletes a local branch. Git refuses one that is not merged unless force. delete_remote also deletes its upstream on the remote.',
    properties: {
      name: { type: 'string', description: 'The local branch to delete.' },
      force: { type: 'boolean', description: 'Delete it even if its commits are not merged anywhere.' },
      delete_remote: { type: 'boolean', description: 'Also delete the remote branch it tracks.' },
    },
    required: ['name'],
    destructive: true,
    network: true,
    run: (repoPath, args) =>
      git.deleteBranch(repoPath, {
        name: readRef(args, 'name', { required: true }),
        force: readBoolean(args, 'force') ?? false,
        deleteRemote: readBoolean(args, 'delete_remote') ?? false,
      }),
  }),
  writeTool({
    name: 'merge',
    title: 'Merge',
    description: 'Merges a branch into the checked out one. Stops on conflicts, which get_status then lists.',
    properties: {
      branch: { type: 'string', description: 'The branch to merge in.' },
      no_fast_forward: { type: 'boolean', description: 'Always make a merge commit.' },
    },
    required: ['branch'],
    run: (repoPath, args) =>
      git.merge(repoPath, {
        branch: readRef(args, 'branch', { required: true }),
        noFastForward: readBoolean(args, 'no_fast_forward') ?? false,
      }),
  }),
  writeTool({
    name: 'rebase',
    title: 'Rebase',
    description: 'Rebases the checked out branch onto another. Stops on conflicts, which get_status then lists.',
    properties: { branch: { type: 'string', description: 'The branch to rebase onto.' } },
    required: ['branch'],
    destructive: true,
    run: (repoPath, args) => git.rebase(repoPath, { branch: readRef(args, 'branch', { required: true }) }),
  }),
  writeTool({
    name: 'abort_operation',
    title: 'Abort operation',
    description: 'Abandons the merge, rebase, cherry-pick or revert in progress, going back to how things were before it.',
    destructive: true,
    run: (repoPath) => git.abortOperation(repoPath),
  }),
  writeTool({
    name: 'continue_operation',
    title: 'Continue operation',
    description: 'Carries on with the merge, rebase, cherry-pick or revert in progress, once its conflicts are resolved and staged.',
    run: (repoPath) => git.continueOperation(repoPath),
  }),
  writeTool({
    name: 'stage',
    title: 'Stage',
    description: 'Stages files for the next commit, or every change when no paths are given.',
    properties: { paths: PATHS('Files to stage, relative to the repository root. Leave out for all.') },
    run: (repoPath, args) => git.stage(repoPath, { paths: readPaths(args, 'paths') }),
  }),
  writeTool({
    name: 'unstage',
    title: 'Unstage',
    description: 'Takes files out of the next commit, keeping their changes, or every file when no paths are given.',
    properties: { paths: PATHS('Files to unstage, relative to the repository root. Leave out for all.') },
    run: (repoPath, args) => git.unstage(repoPath, { paths: readPaths(args, 'paths') }),
  }),
  writeTool({
    name: 'discard',
    title: 'Discard changes',
    description:
      'Throws away the uncommitted changes to files, staged and unstaged, and deletes them if untracked. This cannot be undone.',
    properties: { paths: PATHS('Files to discard, relative to the repository root.') },
    required: ['paths'],
    destructive: true,
    run: (repoPath, args) => git.discard(repoPath, { paths: readPaths(args, 'paths', { required: true }) }),
  }),
  writeTool({
    name: 'commit',
    title: 'Commit',
    description: 'Commits what is staged, or every change with stage_all. amend replaces the latest commit instead.',
    properties: {
      message: { type: 'string', description: 'The commit message. An amend, merge, cherry-pick or revert can leave it out.' },
      stage_all: { type: 'boolean', description: 'Stage every change, untracked files included, first.' },
      amend: { type: 'boolean', description: 'Replace the latest commit, keeping its message unless given one.' },
    },
    async run(repoPath, args) {
      await git.commit(repoPath, {
        message: readString(args, 'message'),
        stageAll: readBoolean(args, 'stage_all') ?? false,
        amend: readBoolean(args, 'amend') ?? false,
      });
    },
  }),
  writeTool({
    name: 'cherry_pick',
    title: 'Cherry-pick',
    description: 'Copies a commit onto the checked out branch. Stops on conflicts, which get_status then lists.',
    properties: { commit: REF('Hash, branch, tag or revision such as HEAD~2.') },
    required: ['commit'],
    async run(repoPath, args) {
      const hash = await resolveCommit(repoPath, readRef(args, 'commit', { required: true }));
      await git.cherryPick(repoPath, { hash });
    },
  }),
  writeTool({
    name: 'revert',
    title: 'Revert commit',
    description: 'Adds a commit that undoes another. Stops on conflicts, which get_status then lists.',
    properties: { commit: REF('Hash, branch, tag or revision such as HEAD~2.') },
    required: ['commit'],
    async run(repoPath, args) {
      const hash = await resolveCommit(repoPath, readRef(args, 'commit', { required: true }));
      await git.revert(repoPath, { hash, keepMessage: true });
    },
  }),
  writeTool({
    name: 'reset',
    title: 'Reset branch',
    description:
      'Moves the checked out branch to a commit. soft keeps every change since then, staged. hard throws them away, uncommitted ones included, and cannot be undone.',
    properties: {
      commit: REF('Hash, branch, tag or revision such as HEAD~1.'),
      mode: { type: 'string', enum: RESET_MODES, description: 'soft or hard.' },
    },
    required: ['commit', 'mode'],
    destructive: true,
    async run(repoPath, args) {
      const mode = readChoice(args, 'mode', RESET_MODES);
      const hash = await resolveCommit(repoPath, readRef(args, 'commit', { required: true }));
      await git.resetToCommit(repoPath, { hash, mode });
    },
  }),
  writeTool({
    name: 'create_tag',
    title: 'Create tag',
    description: 'Tags a commit, with a message to make an annotated tag. Does not push it.',
    properties: {
      name: { type: 'string', description: 'The tag name, such as v1.2.0.' },
      commit: REF('Hash, branch or revision to tag. Defaults to HEAD.'),
      message: { type: 'string', description: 'Makes an annotated tag with this message.' },
    },
    required: ['name'],
    async run(repoPath, args) {
      const hash = await resolveCommit(repoPath, readRef(args, 'commit') ?? 'HEAD');
      await git.createTag(repoPath, {
        name: readRef(args, 'name', { required: true }),
        hash,
        message: readString(args, 'message'),
      });
    },
  }),
  writeTool({
    name: 'delete_tag',
    title: 'Delete tag',
    description:
      'Deletes a local tag. Does not delete it from any remote, so a pushed tag stays there until the user removes it.',
    properties: { name: { type: 'string', description: 'The tag to delete, as list_tags names it.' } },
    required: ['name'],
    destructive: true,
    run: (repoPath, args) => git.deleteTag(repoPath, { name: readRef(args, 'name', { required: true }) }),
  }),
  writeTool({
    name: 'push_tag',
    title: 'Push tag',
    description:
      'Pushes one tag to a remote, origin by default. Never forces: git refuses a tag the remote already has at another commit, and the user has to sort that out.',
    properties: {
      name: { type: 'string', description: 'The tag to push, as list_tags names it.' },
      remote: { type: 'string', description: 'The remote to push to. Defaults to origin, or the first remote.' },
    },
    required: ['name'],
    network: true,
    run(repoPath, args) {
      // Moving a tag on a remote can change what other people build from, so it is left to the user.
      if (args.force !== undefined && args.force !== false) {
        throw new ToolError('Force pushing is not available through MCP. Ask the user to do it in Gitty Up.');
      }
      return git.pushTag(repoPath, {
        name: readRef(args, 'name', { required: true }),
        remote: readString(args, 'remote'),
      });
    },
  }),
  writeTool({
    name: 'create_pull_request',
    title: 'Create pull request',
    description:
      "Opens a pull request (a merge request on GitLab) for a local branch that is already pushed, on github.com, gitlab.com or bitbucket.org. It never pushes: use push first. On GitHub with a token it is created there and its link given back. Otherwise the answer is a link to the host's page with it filled in, for the user to finish in their browser. It is a draft unless draft is false. The title and description default to ones made from the branch's commits.",
    properties: {
      branch: { type: 'string', description: 'The local branch. Defaults to the one checked out.' },
      base: REF("The branch to merge into, as named on the remote. Defaults to the remote's default branch."),
      title: { type: 'string', description: 'Defaults to the subject of the newest commit it brings in.' },
      body: { type: 'string', description: 'The description. Defaults to a list of the commits it brings in.' },
      draft: {
        type: 'boolean',
        description: 'Defaults to true, so someone looks at it before it is marked ready for review.',
      },
    },
    network: true,
    async run(repoPath, args) {
      const branch = readRef(args, 'branch') ?? (await git.getCurrentBranch(repoPath));
      if (!branch) throw new ToolError('No branch is checked out. Say which branch to open it for.');
      const proposal = await git.getPullRequestDraft(repoPath, { branch, base: readRef(args, 'base') });
      if (!proposal.base) {
        throw new ToolError('The remote has no other branch to merge into. Say which with base.');
      }
      const result = await git.openPullRequest(repoPath, {
        branch,
        base: proposal.base,
        title: readString(args, 'title')?.trim() || proposal.title,
        body: readString(args, 'body') ?? proposal.body,
        draft: readBoolean(args, 'draft') ?? true,
      });
      if (result.created) {
        return `Created ${result.hostName} pull request #${result.number} from ${branch} into ${proposal.base}: ${result.url}`;
      }
      const why = result.reason ? ` ${result.reason}` : '';
      return `Not created from here.${why} Give the user this link to finish it on ${result.hostName}: ${result.url}`;
    },
  }),
  writeTool({
    name: 'stash_save',
    title: 'Stash changes',
    description: 'Stashes the uncommitted changes, untracked files included, or only those of some files.',
    properties: {
      message: { type: 'string', description: 'What the stash is for.' },
      paths: PATHS('Only these files, relative to the repository root.'),
    },
    run: (repoPath, args) =>
      git.stashSave(repoPath, { message: readString(args, 'message'), paths: readPaths(args, 'paths') }),
  }),
  writeTool({
    name: 'stash_apply',
    title: 'Apply stash',
    description: 'Applies a stash to the working tree and keeps it.',
    properties: { stash: STASH_REF },
    run: (repoPath, args) => git.stashApply(repoPath, { ref: readStashRef(args) }),
  }),
  writeTool({
    name: 'stash_pop',
    title: 'Pop stash',
    description: 'Applies a stash to the working tree and removes it. A conflict keeps it.',
    properties: { stash: STASH_REF },
    run: (repoPath, args) => git.stashPop(repoPath, { ref: readStashRef(args) }),
  }),
  writeTool({
    name: 'stash_drop',
    title: 'Drop stash',
    description: 'Deletes a stash without applying it. This cannot be undone.',
    properties: { stash: STASH_REF },
    destructive: true,
    run: (repoPath, args) => git.stashDrop(repoPath, { ref: readStashRef(args) }),
  }),
  writeTool({
    name: 'add_worktree',
    title: 'Add worktree',
    description:
      'Adds a working tree in a new or empty folder, checking out a branch there, or with new_branch creating one from start_point.',
    properties: {
      folder: { type: 'string', description: 'Full path of the folder for the new working tree.' },
      branch: { type: 'string', description: 'An existing local or remote branch to check out there.' },
      new_branch: { type: 'string', description: 'Create this branch there instead.' },
      start_point: REF('Where new_branch starts. Defaults to HEAD.'),
    },
    required: ['folder'],
    async run(repoPath, args) {
      const folder = readString(args, 'folder', { required: true });
      if (!path.isAbsolute(folder)) throw new ToolError('"folder" must be a full path.');
      const newBranch = readRef(args, 'new_branch');
      const { path: created } = await git.addWorktree(repoPath, {
        folder,
        newBranch,
        branch: newBranch ? undefined : readRef(args, 'branch', { required: true }),
        startPoint: readRef(args, 'start_point'),
      });
      return `Added a working tree at ${created}.`;
    },
  }),
  writeTool({
    name: 'remove_worktree',
    title: 'Remove worktree',
    description:
      'Deletes a working tree’s folder and forgets it. Git refuses one with changes unless force, which throws them away.',
    properties: {
      folder: { type: 'string', description: 'The working tree’s folder, as list_worktrees gives it.' },
      force: { type: 'boolean', description: 'Remove it even with uncommitted changes, losing them.' },
    },
    required: ['folder'],
    destructive: true,
    run: (repoPath, args) =>
      git.removeWorktree(repoPath, {
        folder: readString(args, 'folder', { required: true }),
        force: readBoolean(args, 'force') ?? false,
      }),
  }),
];
