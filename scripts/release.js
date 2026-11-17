#!/usr/bin/env node
/**
 * Prepares a release as a pull request. On a new `release/v<version>` branch cut from
 * origin's main, it sets the version in package.json, moves CHANGELOG.md's Unreleased notes
 * under it, commits that, pushes the branch and opens a pull request into main. Merging the
 * pull request starts the Release workflow, which tags the merged commit, builds the
 * installers and publishes them as a GitHub release.
 *
 *   npm run release -- 0.3.0          a version of your choosing
 *   npm run release -- patch          0.2.3 -> 0.2.4 (or minor, major)
 *   npm run release -- 0.3.0 -y
 *
 * -y  skips the final confirmation
 * It runs from any branch with no uncommitted changes, and leaves that branch checked out.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { hasRelease, stampUnreleased } from './changelog.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASE_BRANCH = 'main';
const REMOTE = 'origin';
const BASE = `${REMOTE}/${BASE_BRANCH}`;
const CHANGELOG = 'CHANGELOG.md';
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const BUMPS = ['major', 'minor', 'patch'];

const STOPPED = 'Stopped. Nothing was changed.';

export class ReleaseError extends Error {}

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

function run(command, args, { quiet = true } = {}) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })?.trim();
}

const git = (args, options) => run('git', args, options);

function gitSucceeds(args) {
  try {
    git(args);
    return true;
  } catch {
    return false;
  }
}

export function parseArguments(argv) {
  const options = { target: null, yes: false };
  for (const argument of argv) {
    if (argument === '-y' || argument === '--yes') options.yes = true;
    else if (argument === '-m' || argument === '--message') {
      throw new ReleaseError(
        'The release no longer commits pending changes, so -m is gone. Changes reach ' +
          `${BASE_BRANCH} through their own pull requests.`,
      );
    } else if (!options.target) options.target = argument.replace(/^v/, '');
    else throw new ReleaseError(`Unexpected argument "${argument}".`);
  }
  if (!options.target) {
    throw new ReleaseError('Give a version, such as 0.3.0, or one of patch, minor or major.');
  }
  return options;
}

export function nextVersion(current, target) {
  if (!BUMPS.includes(target)) {
    if (!VERSION_PATTERN.test(target)) throw new ReleaseError(`"${target}" is not a version.`);
    return target;
  }
  const [major, minor, patch] = current.split(/[.-]/).map(Number);
  if (target === 'major') return `${major + 1}.0.0`;
  if (target === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** The GitHub page that opens a pull request from `branch` into the base branch. */
export function pullRequestUrl(web, branch, title, body) {
  const query = new URLSearchParams({ expand: '1', title, body });
  return `${web}/compare/${BASE_BRANCH}...${branch}?${query}`;
}

/** A file as it is on origin's main, which the release branch starts from. */
function readBase(file) {
  try {
    return git(['show', `${BASE}:${file}`]);
  } catch {
    return null;
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * What the release does to CHANGELOG.md: moves the Unreleased notes under the new version,
 * whose section the app shows as what's new. `text` is null when nothing changes.
 */
function planChangelog(version) {
  const current = readBase(CHANGELOG);
  if (current === null) return { text: null, note: `there is no ${CHANGELOG}` };
  const date = new Date().toISOString().slice(0, 10);
  const { text, stamped } = stampUnreleased(`${current}\n`, version, date);
  if (stamped) return { text, note: null };
  if (hasRelease(current, version)) return { text: null, note: null };
  return { text: null, note: `${CHANGELOG} has nothing under Unreleased for this release` };
}

function setVersion(version) {
  const pkg = readJson('package.json');
  writeJson('package.json', { ...pkg, version });

  const lock = readJson('package-lock.json');
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  writeJson('package-lock.json', lock);
}

function remoteHas(kind, name) {
  return git(['ls-remote', `--${kind}`, REMOTE, `refs/${kind}/${name}`]) !== '';
}

/** Stops before changing anything if the release branch could not be pushed cleanly. */
function checkRepository(tag, branch) {
  const pending = git(['status', '--porcelain']).split('\n').filter(Boolean);
  if (pending.length > 0) {
    throw new ReleaseError(
      `There are uncommitted changes:\n  ${pending.join('\n  ')}\n` +
        'Commit or set them aside first. They reach main through their own pull request.',
    );
  }
  if (remoteHas('tags', tag)) throw new ReleaseError(`${tag} already exists. Choose a newer version.`);
  if (gitSucceeds(['rev-parse', '--quiet', '--verify', `refs/tags/${tag}`])) {
    throw new ReleaseError(
      `There is a local ${tag} tag that is not on ${REMOTE}, perhaps from an earlier release ` +
        `that did not push. The Release workflow makes the tag now, so delete this one with: ` +
        `git tag -d ${tag}`,
    );
  }
  if (remoteHas('heads', branch)) {
    throw new ReleaseError(
      `${branch} is already on ${REMOTE}, so a pull request for ${tag} may be open. ` +
        `Merge or close it, and delete the branch, before starting again.`,
    );
  }
  if (gitSucceeds(['rev-parse', '--quiet', '--verify', `refs/heads/${branch}`])) {
    throw new ReleaseError(`There is a local ${branch} branch. Delete it with: git branch -D ${branch}`);
  }
}

function remoteWebUrl() {
  const url = git(['remote', 'get-url', REMOTE]);
  const match = /github\.com[:/](.+?)(?:\.git)?$/.exec(url);
  return match ? `https://github.com/${match[1]}` : null;
}

function hasGitHubCli() {
  try {
    run('gh', ['auth', 'status']);
    return true;
  } catch {
    return false;
  }
}

function pullRequestBody(tag, changelog) {
  const lines = [
    `Sets the version to ${tag.slice(1)}${changelog.text ? ` and moves the Unreleased notes in ${CHANGELOG} under it` : ''}.`,
    '',
    `Merging this starts the Release workflow, which tags the merged commit as ${tag}, builds the installers and publishes the release.`,
  ];
  if (changelog.note) lines.push('', `Note: ${changelog.note}, so the app has no notes for it.`);
  return lines.join('\n');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  console.log(`Fetching ${REMOTE}...`);
  git(['fetch', '--quiet', REMOTE, BASE_BRANCH]);
  const current = JSON.parse(readBase('package.json')).version;
  const version = nextVersion(current, options.target);
  const tag = `v${version}`;
  const branch = `release/${tag}`;

  if (version === current) {
    throw new ReleaseError(
      `${current} is already the version on ${BASE_BRANCH}, so there is nothing to merge. To ` +
        `release it as it is, run the Release workflow from GitHub Actions, which tags it as ${tag}.`,
    );
  }
  checkRepository(tag, branch);

  const changelog = planChangelog(version);
  const useCli = hasGitHubCli();

  console.log(`\nRelease ${tag} (from ${current} on ${BASE}):`);
  console.log(`  - create ${branch} from ${BASE}`);
  console.log(`  - commit the new version in package.json`);
  if (changelog.text) console.log(`  - move the Unreleased notes in ${CHANGELOG} under ${tag}`);
  if (changelog.note) console.log(`  - warning: ${changelog.note}, so the app has no notes for it`);
  console.log(`  - push ${branch} to ${REMOTE} and open a pull request into ${BASE_BRANCH}`);
  console.log(`  Merging the pull request tags ${tag} and starts the build.`);

  if (!options.yes) {
    const prompt = createPrompt();
    try {
      const answer = (await prompt.ask('\nContinue? (y/N) ')).toLowerCase();
      if (answer !== 'y' && answer !== 'yes') throw new ReleaseError(STOPPED);
    } finally {
      prompt.close();
    }
  }

  const startingBranch = git(['branch', '--show-current']);
  const returnTo = startingBranch ? [startingBranch] : ['--detach', git(['rev-parse', 'HEAD'])];
  git(['switch', '--quiet', '--no-track', '-c', branch, BASE]);
  try {
    setVersion(version);
    git(['add', 'package.json', 'package-lock.json']);
    if (changelog.text) {
      fs.writeFileSync(path.join(ROOT, CHANGELOG), changelog.text);
      git(['add', CHANGELOG]);
    }
    git(['commit', '--quiet', '-m', `Release ${tag}`]);
  } finally {
    git(['switch', '--quiet', ...returnTo]);
  }

  console.log(`\nPushing ${branch} to ${REMOTE}...`);
  try {
    git(['push', '--quiet', REMOTE, `refs/heads/${branch}`], { quiet: false });
  } catch {
    throw new ReleaseError(
      `The push failed, so nothing reached ${REMOTE}. The release commit is on ${branch} here.\n` +
        `Fix the problem and run: git push ${REMOTE} ${branch}\n` +
        `Or drop it with: git branch -D ${branch}`,
    );
  }

  const title = `Release ${tag}`;
  const body = pullRequestBody(tag, changelog);
  const web = remoteWebUrl();
  if (useCli) {
    try {
      const url = run('gh', [
        'pr', 'create', '--base', BASE_BRANCH, '--head', branch, '--title', title, '--body', body,
      ]);
      console.log(`\nOpened the pull request for ${tag}: ${url}`);
    } catch {
      console.log(`\nCould not open the pull request with gh. Open it here instead:`);
      if (web) console.log(`  ${pullRequestUrl(web, branch, title, body)}`);
    }
  } else if (web) {
    console.log(`\n${branch} is pushed. Open its pull request here:`);
    console.log(`  ${pullRequestUrl(web, branch, title, body)}`);
  } else {
    console.log(`\n${branch} is pushed. Open a pull request from it into ${BASE_BRANCH}.`);
  }
  console.log(`Once it merges, the Release workflow tags ${tag} and builds the installers.`);
  if (web) console.log(`  Build progress: ${web}/actions`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\n${error instanceof ReleaseError ? error.message : error.stack}`);
    process.exit(1);
  });
}
