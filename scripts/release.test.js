import { describe, expect, it } from 'vitest';
import {
  nextVersion,
  parseArguments,
  planChangelog,
  pullRequestUrl,
  ReleaseError,
} from './release.js';

describe('nextVersion', () => {
  it('bumps the current version', () => {
    expect(nextVersion('0.2.3', 'patch')).toBe('0.2.4');
    expect(nextVersion('0.2.3', 'minor')).toBe('0.3.0');
    expect(nextVersion('0.2.3', 'major')).toBe('1.0.0');
  });

  it('takes a version as given', () => {
    expect(nextVersion('0.2.3', '0.5.0-beta.1')).toBe('0.5.0-beta.1');
  });

  it('rejects what is not a version', () => {
    expect(() => nextVersion('0.2.3', 'next')).toThrow(ReleaseError);
  });
});

describe('parseArguments', () => {
  it('reads the version and -y', () => {
    expect(parseArguments(['v0.3.0', '-y'])).toEqual({ target: '0.3.0', yes: true });
  });

  it('needs a version', () => {
    expect(() => parseArguments([])).toThrow(ReleaseError);
  });

  it('explains that -m is gone', () => {
    expect(() => parseArguments(['patch', '-m', 'Fix'])).toThrow(/pull requests/);
  });
});

describe('pullRequestUrl', () => {
  it('opens a pull request from the release branch into main', () => {
    const url = new URL(
      pullRequestUrl('https://github.com/o/r', 'release/v0.3.0', 'Release v0.3.0', 'Body & more'),
    );
    expect(url.pathname).toBe('/o/r/compare/main...release/v0.3.0');
    expect(url.searchParams.get('expand')).toBe('1');
    expect(url.searchParams.get('title')).toBe('Release v0.3.0');
    expect(url.searchParams.get('body')).toBe('Body & more');
  });
});

describe('planChangelog', () => {
  const HEADER = '# Changelog\n\n## Unreleased\n';

  it('moves the Unreleased notes under the new version', () => {
    const text = planChangelog(`${HEADER}\n- A fix\n`, '0.2.6', '2026-11-18');
    expect(text).toContain('## 0.2.6 - 2026-11-18\n\n- A fix');
  });

  it('leaves alone a version that already has its notes', () => {
    expect(planChangelog(`${HEADER}\n## 0.2.6 - 2026-11-18\n\n- A fix\n`, '0.2.6', '2026-11-18')).toBe(
      null,
    );
  });

  it('stops a release with nothing under Unreleased, as its build would fail', () => {
    expect(() => planChangelog(`${HEADER}\n## 0.2.5 - 2026-11-17\n\n- Old\n`, '0.2.6', '2026-11-18')).toThrow(
      /nothing under Unreleased/,
    );
    expect(() => planChangelog(null, '0.2.6', '2026-11-18')).toThrow(ReleaseError);
  });
});
