import { describe, expect, it } from 'vitest';
import { TagHelper } from './TagHelper.js';

const tags = [
  { name: 'v1.0.0', commit: 'abc1234', annotated: true, subject: 'First release' },
  { name: 'release/2.0', commit: 'def5678', annotated: false, subject: 'Second' },
];

describe('TagHelper', () => {
  it('finds a tag by its exact name', () => {
    expect(TagHelper.find(tags, 'v1.0.0')).toBe(tags[0]);
    expect(TagHelper.find(tags, 'V1.0.0')).toBeUndefined();
    expect(TagHelper.exists(tags, 'release/2.0')).toBe(true);
    expect(TagHelper.exists(undefined, 'v1')).toBe(false);
  });

  it('filters by what was typed, ignoring case', () => {
    expect(TagHelper.filter(tags, ' RELEASE').map((tag) => tag.name)).toEqual(['release/2.0']);
    expect(TagHelper.filter(tags, '')).toHaveLength(2);
  });

  it('says what a tag is', () => {
    expect(TagHelper.describe(tags[0])).toBe('Annotated tag on abc1234: First release');
    expect(TagHelper.describe(tags[1])).toBe('Tag on def5678: Second');
  });
});
