import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  expandWindowsVariables,
  forgetShellEnv,
  joinPaths,
  loadShellEnv,
  parseMarkedEnv,
} from './shellEnv.js';

const MARKER = '__GITTY_ENV_MARKER__';

afterEach(() => forgetShellEnv());

describe('parseMarkedEnv', () => {
  it('reads the environment between the markers, ignoring what a profile printed', () => {
    const stdout = `Welcome back!\n${MARKER}{"PATH":"/a:/b","LINES":"one\\ntwo"}${MARKER}\nbye`;
    expect(parseMarkedEnv(stdout)).toEqual({ PATH: '/a:/b', LINES: 'one\ntwo' });
  });

  it('gives null without both markers or with broken JSON', () => {
    expect(parseMarkedEnv('nothing here')).toBeNull();
    expect(parseMarkedEnv(`${MARKER}{"PATH":`)).toBeNull();
    expect(parseMarkedEnv(`${MARKER}{oops}${MARKER}`)).toBeNull();
  });
});

describe('expandWindowsVariables', () => {
  it('expands known variables, whatever their case, and leaves unknown ones', () => {
    const env = { SystemRoot: 'C:\\Windows' };
    expect(expandWindowsVariables('%SYSTEMROOT%\\System32;%MISSING%\\bin', env)).toBe(
      'C:\\Windows\\System32;%MISSING%\\bin',
    );
  });
});

describe('joinPaths', () => {
  it('keeps the first of each folder and drops empty entries', () => {
    const joined = joinPaths(['a', 'b', ''].join(path.delimiter), ['b', 'c'].join(path.delimiter));
    expect(joined).toBe(['a', 'b', 'c'].join(path.delimiter));
  });
});

describe('loadShellEnv', () => {
  it("has the app's own variables and a PATH", async () => {
    const env = await loadShellEnv();
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path');
    expect(pathKey).toBeDefined();
    expect(env[pathKey].length).toBeGreaterThan(0);
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  }, 15_000);
});
