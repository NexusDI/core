// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { decide, EXTRA_PATHS, PATHS, touches } from './docs-changed.mjs';

describe('the docs inputs', () => {
  it('name every workflow that builds or checks the site', () => {
    expect(EXTRA_PATHS).toEqual([
      '.github/workflows/ci.yml',
      '.github/workflows/docs-next.yml',
      '.github/workflows/docs-snapshot.yml',
    ]);
  });
});

describe('touches', () => {
  it('matches a file under a /** path and an exact file', () => {
    expect(touches(PATHS, ['libs/core/src/index.ts'])).toBe(true);
    expect(touches(PATHS, ['package-lock.json'])).toBe(true);
    expect(touches(PATHS, ['.github/workflows/docs-next.yml'])).toBe(true);
    expect(touches(PATHS, ['benchmarks/results/size.json'])).toBe(true);
  });

  it('ignores a change outside every docs input', () => {
    expect(touches(PATHS, ['README.md', 'tools/release/stage.mjs'])).toBe(
      false,
    );
    expect(touches(PATHS, ['apps/docs-e2e/src/home.spec.ts'])).toBe(false);
  });
});

describe('decide', () => {
  const unknownBase = () => {
    throw new Error('bad object');
  };

  it('reports a touched change when the base commit is missing', () => {
    expect(decide('f'.repeat(40), unknownBase)).toEqual({
      touched: true,
      message:
        'the base commit is not in the clone; this change touches a docs input; the docs job builds and checks the site',
    });
  });

  it('checks everything on a new branch, with no git call', () => {
    const diff = vi.fn();
    expect(decide('', diff).touched).toBe(true);
    expect(decide('0'.repeat(40), diff).touched).toBe(true);
    expect(diff).not.toHaveBeenCalled();
  });

  it('reads the diff against a known base', () => {
    expect(decide('abc', () => ['libs/core/src/index.ts'])).toMatchObject({
      touched: true,
    });
    expect(decide('abc', () => ['README.md'])).toEqual({
      touched: false,
      message: 'this change touches no docs input; the docs job ends here',
    });
  });
});
