import { describe, expect, it } from 'vitest';
import { hasRelease, stampUnreleased } from './changelog.js';

const CHANGELOG = `# Changelog

Intro.

## Unreleased

### Added

- New thing

## 0.2.2 - 2026-11-09

- Old thing
`;

describe('stampUnreleased', () => {
  it('moves the unreleased notes under the new version, leaving Unreleased empty', () => {
    const { text, stamped } = stampUnreleased(CHANGELOG, '0.3.0', '2026-12-01');
    expect(stamped).toBe(true);
    expect(text).toBe(`# Changelog

Intro.

## Unreleased

## 0.3.0 - 2026-12-01

### Added

- New thing

## 0.2.2 - 2026-11-09

- Old thing
`);
    expect(hasRelease(text, '0.3.0')).toBe(true);
    // Stamping again finds nothing new.
    expect(stampUnreleased(text, '0.3.1', '2026-12-02').stamped).toBe(false);
  });

  it('works when Unreleased is the last section, and leaves a changelog without one alone', () => {
    const { text } = stampUnreleased('## Unreleased\n- Only\n', '1.0.0', '2026-01-01');
    expect(text).toBe('## Unreleased\n\n## 1.0.0 - 2026-01-01\n\n- Only\n');
    expect(stampUnreleased('## 1.0.0\n- x\n', '1.0.1', 'd')).toEqual({ text: '## 1.0.0\n- x\n', stamped: false });
  });

  it('matches a version heading exactly', () => {
    expect(hasRelease('## 0.2.20 - x', '0.2.2')).toBe(false);
    expect(hasRelease('## v0.2.2', '0.2.2')).toBe(true);
  });
});
