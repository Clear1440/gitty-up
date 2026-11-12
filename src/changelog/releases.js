// Both are bundled when the app is built, so each build carries its own release notes.
import changelogText from '../../CHANGELOG.md?raw';
import { version } from '../../package.json';
import { parseChangelog } from './changelog.js';

export const APP_VERSION = version;

/** Every release in CHANGELOG.md, newest first, with Unreleased (version null) on top if it has entries. */
export const RELEASES = parseChangelog(changelogText);
