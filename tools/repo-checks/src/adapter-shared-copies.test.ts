import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { sharedCopies } from './adapter-shared-copies.js';

const FIXTURES = join(
  import.meta.dirname,
  '__fixtures__',
  'adapter-shared-copies',
);

describe('sharedCopies', () => {
  it('accepts byte-identical copies', () => {
    const result = sharedCopies(join(FIXTURES, 'same'));
    expect(result.violations).toEqual([]);
    expect(result.copies['request-scope.ts']).toEqual([
      'libs/a/src/internal/request-scope.ts',
      'libs/b/src/internal/request-scope.ts',
    ]);
  });

  it('names both paths when one copy was edited alone', () => {
    expect(sharedCopies(join(FIXTURES, 'edited')).violations).toEqual([
      'libs/b/src/internal/request-scope.ts differs from libs/a/src/internal/request-scope.ts; edit every copy of request-scope.ts in one commit',
    ]);
  });

  const live = sharedCopies(workspaceRoot);

  it('holds for the workspace', () => {
    expect(live.violations).toEqual([]);
  });

  it('finds at least two adapters carrying request-scope.ts', () => {
    expect(live.copies['request-scope.ts']?.length ?? 0).toBeGreaterThanOrEqual(
      2,
    );
  });
});
