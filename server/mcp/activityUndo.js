import { ApiError } from '../errors.js';
import * as git from '../git/gitService.js';
import { runGit } from '../git/runGit.js';

const OPTIONAL = { allowedExitCodes: [0, 1, 128] };
const short = (hash) => hash?.slice(0, 7);

/** The commit or object a ref names now, or null if it names none. */
async function readRef(repoPath, ref) {
  return (await runGit(repoPath, ['rev-parse', '--verify', '--quiet', ref], OPTIONAL)).trim() || null;
}

/** Where HEAD is: its commit, and the branch checked out, or null when detached. */
export async function readHead(repoPath) {
  const [head, branch] = await Promise.all([
    readRef(repoPath, 'HEAD'),
    runGit(repoPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'], OPTIONAL).then(
      (output) => output.trim() || null,
    ),
  ]);
  return { head, branch };
}

const refused = (reason) => ({ reason });
const refuse = (message) => {
  throw ApiError.gitFailure(message);
};

async function assertNoOperation(repoPath) {
  const { operation } = await git.getStatus(repoPath);
  if (operation) refuse(`A ${operation} is in progress. Finish or abort it first.`);
}

/** The branch the call left checked out must still be, at the commit it left it on. */
async function assertStillAfter(repoPath, { after }) {
  const now = await readHead(repoPath);
  if (now.branch !== after.branch) {
    refuse(
      after.branch
        ? `${after.branch} is no longer checked out, so this was left as it is.`
        : 'HEAD has moved since, so this was left as it is.',
    );
  }
  if (now.head !== after.head) {
    refuse(`${after.branch ?? 'HEAD'} has moved since, so undoing could lose newer commits. Nothing was changed.`);
  }
}

/**
 * Moves the branch back to where it was before the call, with `git reset --keep` (which
 * keeps uncommitted changes, and refuses if they touch the files it would change) or
 * `--soft` (which only moves the branch, leaving every file as it is).
 */
function moveBranchBack({ mode, explain }) {
  return {
    describe(entry) {
      const { before, after } = entry;
      if (!before?.head || !after?.head) return refused('The repository had no commits before.');
      if (!before.branch || before.branch !== after.branch) {
        return refused('It did not run on one branch from start to end, so there is no branch to move back.');
      }
      if (before.head === after.head) return refused('It did not move the branch, so there is nothing to undo.');
      return {
        description: `Moves ${after.branch} back from ${short(after.head)} to ${short(before.head)}, where it was before. ${explain(entry)}`,
      };
    },
    async run(repoPath, entry) {
      await assertNoOperation(repoPath);
      await assertStillAfter(repoPath, entry);
      await runGit(repoPath, ['reset', `--${mode(entry)}`, entry.before.head]);
    },
  };
}

const KEEPING_CHANGES =
  'Your uncommitted changes are kept. If they touch the same files, git refuses and nothing changes.';

const moveBack = moveBranchBack({ mode: () => 'keep', explain: () => KEEPING_CHANGES });

/** Switches back to the branch checked out before the call, if it is still where the call left it. */
const switchBack = {
  describe({ before, after }) {
    if (!before?.branch) return refused('No branch was checked out before, so there is none to go back to.');
    if (before.branch === after?.branch) return refused('It stayed on the same branch, so there is nothing to undo.');
    return { description: `Checks ${before.branch} back out. Uncommitted changes come along, as with any checkout.` };
  },
  async run(repoPath, entry) {
    await assertNoOperation(repoPath);
    await assertStillAfter(repoPath, entry);
    await git.checkout(repoPath, { branch: entry.before.branch });
  },
};

/**
 * The write tools whose effect can be taken back from the app, and how. Every other tool,
 * such as push or discard, or any tool added later, has no undo unless listed here.
 *
 * - `capture` runs straight after a call that worked, and records what `run` will need to
 *   check that nothing has moved since.
 * - `describe` says exactly what undoing will do, or why it can't be.
 * - `run` checks the repository is still as the call left it, then undoes it, or refuses.
 */
const UNDOS = {
  commit: moveBranchBack({
    mode: () => 'soft',
    explain: () => 'What the commit held comes back as staged changes, so no work is lost.',
  }),
  reset: moveBranchBack({
    mode: (entry) => (entry.args?.mode === 'soft' ? 'soft' : 'keep'),
    explain: (entry) =>
      entry.args?.mode === 'soft'
        ? 'Every file stays as it is.'
        : `${KEEPING_CHANGES} Uncommitted changes the reset threw away cannot be brought back.`,
  }),
  merge: moveBack,
  cherry_pick: moveBack,
  revert: moveBack,
  rebase: moveBack,
  pull: moveBack,
  checkout: switchBack,
  checkout_commit: switchBack,
  create_branch: {
    async capture(repoPath, args) {
      const name = String(args.name).trim();
      return { branch: { name, head: await readRef(repoPath, `refs/heads/${name}`) } };
    },
    describe({ before, after, branch }) {
      if (!branch?.head) return refused('The branch it made could not be found afterwards.');
      const isCheckedOut = after?.branch === branch.name;
      if (isCheckedOut && !before?.branch) {
        return refused('No branch was checked out before, so there is none to go back to.');
      }
      const switching = isCheckedOut ? ` after checking ${before.branch} back out` : '';
      return {
        description: `Deletes the branch ${branch.name}${switching}. It still points at ${short(branch.head)}, where it was made, so no commits are lost.`,
      };
    },
    async run(repoPath, { before, branch }) {
      const head = await readRef(repoPath, `refs/heads/${branch.name}`);
      if (!head) refuse(`${branch.name} is already gone.`);
      if (head !== branch.head) refuse(`${branch.name} has new commits since, so it was kept.`);
      if ((await git.getCurrentBranch(repoPath)) === branch.name) {
        if (!before?.branch) refuse(`${branch.name} is checked out, and there is no branch to go back to.`);
        await assertNoOperation(repoPath);
        await git.checkout(repoPath, { branch: before.branch });
      }
      // -D, as git's own merged check is against HEAD: the branch is known to hold nothing new.
      await runGit(repoPath, ['branch', '-D', branch.name]);
    },
  },
  create_tag: {
    async capture(repoPath, args) {
      const name = String(args.name).trim();
      return { tag: { name, object: await readRef(repoPath, `refs/tags/${name}`) } };
    },
    describe({ tag }) {
      if (!tag?.object) return refused('The tag it made could not be found afterwards.');
      return { description: `Deletes the tag ${tag.name} from this repository. Remotes are not touched.` };
    },
    async run(repoPath, { tag }) {
      const object = await readRef(repoPath, `refs/tags/${tag.name}`);
      if (!object) refuse(`${tag.name} is already gone.`);
      if (object !== tag.object) refuse(`${tag.name} has been moved since, so it was kept.`);
      await runGit(repoPath, ['tag', '--delete', tag.name]);
    },
  },
  stash_save: {
    async capture(repoPath) {
      return { stash: await readRef(repoPath, 'refs/stash') };
    },
    describe({ stash }) {
      if (!stash) return refused('The stash it made could not be found afterwards.');
      return {
        description: `Pops the stash it made (${short(stash)}) back into your working tree. If that conflicts, the stash is kept.`,
      };
    },
    async run(repoPath, { stash }) {
      if ((await readRef(repoPath, 'refs/stash')) !== stash) {
        refuse('That stash is no longer the latest one, so it was left alone. Apply it from the Stashes list.');
      }
      await git.stashPop(repoPath, { ref: 'stash@{0}' });
    },
  },
};

const CANNOT_UNDO = 'This can’t be undone from here.';

/** What the tool `name` needs recorded after a call that worked, for its undo. */
export async function captureForUndo(name, repoPath, args) {
  const undo = Object.hasOwn(UNDOS, name) ? UNDOS[name] : null;
  return undo?.capture ? undo.capture(repoPath, args) : {};
}

/**
 * Whether an entry can be undone from the app: `{ available: true, description }`, saying
 * exactly what undoing does, or `{ available: false, reason }`. It reads only the entry,
 * so the repository may have moved on since; undoing checks that before changing anything.
 */
export function describeUndo(entry) {
  if (!entry.write) return null;
  if (entry.undone) return { available: false, reason: 'Already undone.' };
  const undo = Object.hasOwn(UNDOS, entry.tool) ? UNDOS[entry.tool] : null;
  if (!undo) return { available: false, reason: CANNOT_UNDO };
  if (entry.outcome !== 'ok') return { available: false, reason: 'It failed, so there is nothing to undo here.' };
  if (!entry.repository?.id) return { available: false, reason: CANNOT_UNDO };
  const { description, reason } = undo.describe(entry);
  return description ? { available: true, description } : { available: false, reason };
}

/**
 * Undoes a logged call, for the user from the app. This is not an AI tool, so it can
 * reach any linked repository, whatever the MCP server is limited to. Marks the entry
 * as undone, and resolves with it.
 */
export async function undoActivity({ activity, store }, id) {
  const entry = await activity.get(id);
  if (!entry) throw ApiError.notFound('That activity is no longer in the log.');
  const undo = describeUndo(entry);
  if (!undo?.available) throw ApiError.badRequest(undo?.reason ?? CANNOT_UNDO);

  const repository = await store.get(entry.repository.id);
  if (!repository?.path) throw ApiError.notFound(`${entry.repository.name} is no longer linked.`);
  await UNDOS[entry.tool].run(repository.path, entry);

  const updated = await activity.update(id, { undone: { time: new Date().toISOString() } });
  await activity.flush();
  return updated;
}
