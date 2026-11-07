#!/usr/bin/env node
/**
 * Releases a version: commits any pending changes, sets the version in package.json,
 * tags it, and pushes main and the tag. The tag starts the Release workflow, which builds
 * the installers onto a draft GitHub release.
 *
 *   npm run release -- 0.2.0          a version of your choosing
 *   npm run release -- patch          0.1.0 -> 0.1.1 (or minor, major)
 *   npm run release -- 0.2.0 -m "Fix the diff view" -y
 *
 * -m  the message for committing pending changes, instead of being asked for one
 * -y  skips the final confirmation
 * Giving the version already in package.json tags it as it is, which suits a first release.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

const ROOT = path.resolve(import.meta.dirname, '..');
const RELEASE_BRANCH = 'main';
const REMOTE = 'origin';
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const BUMPS = ['major', 'minor', 'patch'];

const STOPPED = 'Stopped. Nothing was changed.';

class ReleaseError extends Error {}

/**
 * Asks questions on the terminal. Reading lines through one iterator keeps answers
 * typed or piped in ahead of a question, and closed input counts as an empty answer.
 */
function createPrompt() {
  const lines = createInterface({ input: process.stdin, terminal: false });
  const iterator = lines[Symbol.asyncIterator]();
  return {
    async ask(question) {
      process.stdout.write(question);
      const { value, done } = await iterator.next();
      if (done) process.stdout.write('\n');
      return done ? '' : value.trim();
    },
    close: () => lines.close(),
  };
}

function git(args, { quiet = true } = {}) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })?.trim();
}

function gitSucceeds(args) {
  try {
    git(args);
    return true;
  } catch {
    return false;
  }
}

function parseArguments(argv) {
  const options = { target: null, message: null, yes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '-y' || argument === '--yes') options.yes = true;
    else if (argument === '-m' || argument === '--message') options.message = argv[(index += 1)];
    else if (!options.target) options.target = argument.replace(/^v/, '');
    else throw new ReleaseError(`Unexpected argument "${argument}".`);
  }
  if (!options.target) {
    throw new ReleaseError('Give a version, such as 0.2.0, or one of patch, minor or major.');
  }
  return options;
}

function nextVersion(current, target) {
  if (!BUMPS.includes(target)) {
    if (!VERSION_PATTERN.test(target)) throw new ReleaseError(`"${target}" is not a version.`);
    return target;
  }
  const [major, minor, patch] = current.split(/[.-]/).map(Number);
  if (target === 'major') return `${major + 1}.0.0`;
  if (target === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(data, null, 2)}\n`);
}

function setVersion(version) {
  const pkg = readJson('package.json');
  writeJson('package.json', { ...pkg, version });

  const lock = readJson('package-lock.json');
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  writeJson('package-lock.json', lock);
}

/** Stops before changing anything if the release could not be pushed cleanly. */
function checkRepository(tag) {
  const branch = git(['branch', '--show-current']);
  if (branch !== RELEASE_BRANCH) {
    throw new ReleaseError(
      `Releases come from ${RELEASE_BRANCH}, but ${branch || 'no branch'} is checked out.`,
    );
  }

  console.log(`Fetching ${REMOTE}...`);
  git(['fetch', REMOTE, RELEASE_BRANCH, '--tags']);
  const behind = Number(git(['rev-list', '--count', `HEAD..${REMOTE}/${RELEASE_BRANCH}`]));
  if (behind > 0) {
    throw new ReleaseError(
      `${RELEASE_BRANCH} is ${behind} commit(s) behind ${REMOTE}. Pull first, then release.`,
    );
  }
  if (gitSucceeds(['rev-parse', '--quiet', '--verify', `refs/tags/${tag}`])) {
    throw new ReleaseError(`${tag} already exists. Choose a newer version.`);
  }
}

function pendingChanges() {
  return git(['status', '--porcelain']).split('\n').filter(Boolean);
}

function remoteWebUrl() {
  const url = git(['remote', 'get-url', REMOTE]);
  const match = /github\.com[:/](.+?)(?:\.git)?$/.exec(url);
  return match ? `https://github.com/${match[1]}` : null;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const current = readJson('package.json').version;
  const version = nextVersion(current, options.target);
  const tag = `v${version}`;

  checkRepository(tag);

  const changes = pendingChanges();
  const prompt = createPrompt();
  let commitMessage = options.message;
  try {
    if (changes.length > 0) {
      console.log(`\nThese uncommitted changes will be committed first:\n  ${changes.join('\n  ')}`);
      commitMessage ||= await prompt.ask('Commit message (leave empty to stop): ');
      if (!commitMessage) throw new ReleaseError(STOPPED);
    }

    console.log(`\nRelease ${tag}${version === current ? '' : ` (from ${current})`}:`);
    if (changes.length > 0) {
      console.log(`  - commit ${changes.length} changed path(s): "${commitMessage}"`);
    }
    if (version !== current) console.log(`  - commit the new version in package.json`);
    console.log(`  - tag ${tag}`);
    console.log(`  - push ${RELEASE_BRANCH} and ${tag} to ${REMOTE}, which starts the build`);

    if (!options.yes) {
      const answer = (await prompt.ask('\nContinue? (y/N) ')).toLowerCase();
      if (answer !== 'y' && answer !== 'yes') throw new ReleaseError(STOPPED);
    }
  } finally {
    prompt.close();
  }

  if (changes.length > 0) {
    git(['add', '--all']);
    git(['commit', '--quiet', '-m', commitMessage]);
  }
  if (version !== current) {
    setVersion(version);
    git(['add', 'package.json', 'package-lock.json']);
    git(['commit', '--quiet', '-m', `Release ${tag}`]);
  }
  git(['tag', '-a', tag, '-m', `Release ${tag}`]);

  console.log(`\nPushing to ${REMOTE}...`);
  try {
    git(['push', '--atomic', REMOTE, RELEASE_BRANCH, `refs/tags/${tag}`], { quiet: false });
  } catch {
    throw new ReleaseError(
      `The push failed, so nothing reached ${REMOTE}. The commits and tag are still here.\n` +
        `Fix the problem and run: git push --atomic ${REMOTE} ${RELEASE_BRANCH} refs/tags/${tag}\n` +
        `Or drop the tag with: git tag -d ${tag}`,
    );
  }

  const web = remoteWebUrl();
  console.log(`\n${tag} is pushed and the installers are building.`);
  if (web) {
    console.log(`  Build progress: ${web}/actions`);
    console.log(`  Draft release:  ${web}/releases (publish it once the files are attached)`);
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof ReleaseError ? error.message : error.stack}`);
  process.exit(1);
});
