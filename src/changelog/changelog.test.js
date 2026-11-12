import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  newReleasesSinceLastStart,
  parseChangelog,
  parseInline,
  releasesSince,
} from './changelog.js';

const SAMPLE = `# Changelog

An introduction that is skipped.

## Unreleased

## 1.2.0 - 2026-11-20

### Added

- **Bold** start, with a long line
  that wraps onto the next.
- Second

### Fixed
- Third

## v1.1.0

The first release.
It had two lines.
`;

describe('parseChangelog', () => {
  it('reads releases, sections, wrapped items and notes, skipping empty releases', () => {
    expect(parseChangelog(SAMPLE)).toEqual([
      {
        version: '1.2.0',
        date: '2026-11-20',
        notes: [],
        sections: [
          { title: 'Added', items: ['**Bold** start, with a long line that wraps onto the next.', 'Second'] },
          { title: 'Fixed', items: ['Third'] },
        ],
      },
      { version: '1.1.0', date: null, notes: ['The first release. It had two lines.'], sections: [] },
    ]);
  });

  it('keeps an Unreleased section that has entries, with no version', () => {
    const [release] = parseChangelog('## Unreleased\n\n- Coming soon\n');
    expect(release).toMatchObject({ version: null, sections: [{ title: null, items: ['Coming soon'] }] });
  });

  it('reads the real CHANGELOG.md, with a section for the version in package.json', () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const releases = parseChangelog(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'));
    const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(releases.some((release) => release.version === version)).toBe(true);
  });
});

describe('versions', () => {
  it('compares by number, not by text', () => {
    expect(compareVersions('0.2.10', '0.2.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.9.0', '1.0.0')).toBeLessThan(0);
  });

  it('picks the releases between the last one seen and the current one', () => {
    const releases = ['0.4.0', '0.3.0', '0.2.1', '0.2.0'].map((version) => ({ version }));
    expect(releasesSince([{ version: null }, ...releases], '0.2.0', '0.3.0')).toEqual([
      { version: '0.3.0' },
      { version: '0.2.1' },
    ]);
  });

  it('shows new releases only after an update, not on a first start or a downgrade', () => {
    const releases = [{ version: '0.3.0' }, { version: '0.2.0' }];
    expect(newReleasesSinceLastStart('0.2.0', '0.3.0', releases)).toEqual([{ version: '0.3.0' }]);
    expect(newReleasesSinceLastStart(null, '0.3.0', releases)).toEqual([]);
    expect(newReleasesSinceLastStart('0.3.0', '0.3.0', releases)).toEqual([]);
    expect(newReleasesSinceLastStart('0.4.0', '0.3.0', releases)).toEqual([]);
  });
});

describe('parseInline', () => {
  it('finds bold, code and links among plain text', () => {
    expect(parseInline('Use **this** in `.gitty`, see [docs](https://x.test).')).toEqual([
      { type: 'text', text: 'Use ' },
      { type: 'bold', text: 'this' },
      { type: 'text', text: ' in ' },
      { type: 'code', text: '.gitty' },
      { type: 'text', text: ', see ' },
      { type: 'link', text: 'docs', href: 'https://x.test' },
      { type: 'text', text: '.' },
    ]);
  });
});
