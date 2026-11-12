import { afterEach, describe, expect, it } from 'vitest';
import { clearUndoHistories, recordAction, takeUndoStep, undoStepFor } from './undoHistory.js';

const file = (path) => ({ path });
const status = ({ staged = [], unstaged = [], conflicted = [] } = {}) => ({
  staged: staged.map(file),
  unstaged: unstaged.map(file),
  conflicted: conflicted.map(file),
});

afterEach(() => clearUndoHistories());

describe('undoStepFor', () => {
  it('unstages what was staged, and stages what was unstaged', () => {
    expect(undoStepFor('stage', { paths: ['a.txt'] }, status())).toEqual({
      kind: 'actions',
      actions: [{ name: 'unstage', input: { paths: ['a.txt'] } }],
      label: 'Undid staging a.txt',
    });
    expect(undoStepFor('unstage', { paths: ['a.txt', 'b.txt'] }).actions).toEqual([
      { name: 'stage', input: { paths: ['a.txt', 'b.txt'] } },
    ]);
  });

  it('takes the files from the status before, for staging or unstaging everything', () => {
    const before = status({ staged: ['s.txt'], unstaged: ['u.txt'] });
    expect(undoStepFor('stage', {}, before).actions).toEqual([
      { name: 'unstage', input: { paths: ['u.txt'] } },
    ]);
    expect(undoStepFor('unstage', {}, before).actions).toEqual([
      { name: 'stage', input: { paths: ['s.txt'] } },
    ]);
    expect(undoStepFor('stage', {}, status())).toBeNull();
  });

  it('puts a conflict back when staging resolved it', () => {
    const before = status({ unstaged: ['u.txt'], conflicted: ['c.txt'] });
    expect(undoStepFor('stage', {}, before).actions).toEqual([
      { name: 'unstage', input: { paths: ['u.txt'] } },
      { name: 'unresolveConflict', input: { path: 'c.txt' } },
    ]);
    expect(undoStepFor('resolveConflict', { path: 'c.txt', content: 'x' }).actions).toEqual([
      { name: 'unresolveConflict', input: { path: 'c.txt' } },
    ]);
  });

  it('undoes a commit as a commit, and has nothing for actions it cannot take back', () => {
    expect(undoStepFor('commit', { message: 'x' })).toEqual({ kind: 'commit' });
    expect(undoStepFor('push')).toBeNull();
    expect(undoStepFor('merge', { branch: 'main' })).toBeNull();
  });
});

describe('the history', () => {
  it('takes back the latest change first', () => {
    recordAction('repo', 'stage', { paths: ['a.txt'] }, status());
    recordAction('repo', 'commit', { message: 'x' }, status());
    expect(takeUndoStep('repo')).toEqual({ kind: 'commit' });
    expect(takeUndoStep('repo')).toBeNull();
  });

  it('keeps steps across actions that leave the branch alone, and drops them on others', () => {
    recordAction('repo', 'stage', { paths: ['a.txt'] }, status());
    recordAction('repo', 'push', {}, status());
    expect(takeUndoStep('repo')?.label).toBe('Undid staging a.txt');

    recordAction('repo', 'stage', { paths: ['a.txt'] }, status());
    recordAction('repo', 'merge', { branch: 'main' }, status());
    expect(takeUndoStep('repo')).toBeNull();
  });

  it('keeps each repository to its own steps', () => {
    recordAction('one', 'stage', { paths: ['a.txt'] }, status());
    expect(takeUndoStep('two')).toBeNull();
    expect(takeUndoStep('one')).not.toBeNull();
  });
});
