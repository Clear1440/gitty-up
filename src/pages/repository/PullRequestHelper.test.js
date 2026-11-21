import { describe, expect, it } from 'vitest';
import { PullRequestHelper } from './PullRequestHelper.js';

const pull = (overrides = {}) => ({
  number: 7,
  title: 'Add x',
  url: 'https://github.com/acme/app/pull/7',
  branch: 'feature/x',
  draft: false,
  review: null,
  checks: null,
  ...overrides,
});

describe('PullRequestHelper.summarize', () => {
  it.each([
    [{ checks: 'failing', review: 'approved' }, 'failing'],
    [{ checks: 'passing', review: 'changes-requested' }, 'changes-requested'],
    [{ checks: 'pending', review: 'approved' }, 'pending'],
    [{ checks: 'passing', review: 'review-required' }, 'passing'],
    [{ checks: 'none', review: 'approved' }, 'passing'],
    [{ checks: 'none', review: 'review-required' }, null],
    [{ checks: null, review: null }, null],
  ])('sums up %o as %s', (status, expected) => {
    expect(PullRequestHelper.summarize(status)).toBe(expected);
  });
});

describe('PullRequestHelper.describe', () => {
  it('gives the number and title, then the review and checks', () => {
    expect(PullRequestHelper.describe(pull({ review: 'approved', checks: 'failing' }))).toBe(
      'Pull request #7: Add x\nApproved\nChecks failing',
    );
  });

  it('says nothing of status the host did not give', () => {
    expect(PullRequestHelper.describe(pull({ draft: true }))).toBe('Draft pull request #7: Add x');
  });
});

describe('PullRequestHelper.findForBranch', () => {
  const pullRequests = [pull(), pull({ number: 8, branch: 'other' })];

  it('finds a local branch by its upstream name', () => {
    const branch = { name: 'mine', upstream: 'origin/feature/x', upstreamGone: false };
    expect(PullRequestHelper.findForBranch(pullRequests, branch, 'local')?.number).toBe(7);
    expect(PullRequestHelper.remoteOf(branch, 'local', 'upstream')).toBe('origin');
  });

  it('finds a local branch with no upstream by its own name', () => {
    const branch = { name: 'other', upstream: null };
    expect(PullRequestHelper.findForBranch(pullRequests, branch, 'local')?.number).toBe(8);
    expect(PullRequestHelper.remoteOf(branch, 'local', 'origin')).toBe('origin');
  });

  it('ignores an upstream that is gone', () => {
    const branch = { name: 'other', upstream: 'origin/feature/x', upstreamGone: true };
    expect(PullRequestHelper.findForBranch(pullRequests, branch, 'local')?.number).toBe(8);
  });

  it('finds a remote branch by its name on the remote', () => {
    const branch = { name: 'fork/feature/x', remote: 'fork', localName: 'feature/x' };
    expect(PullRequestHelper.findForBranch(pullRequests, branch, 'remote')?.number).toBe(7);
    expect(PullRequestHelper.remoteOf(branch, 'remote', 'origin')).toBe('fork');
  });

  it('finds nothing when there are no pull requests', () => {
    expect(PullRequestHelper.findForBranch(undefined, { name: 'x' }, 'local')).toBeNull();
  });
});
