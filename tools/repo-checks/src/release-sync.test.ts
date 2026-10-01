import { describe, expect, it } from 'vitest';

import { mergeManifests, restoreWorkspacePins } from '@nexusdi/release';

/**
 * A sync merges main into release/X.Y (release spec section 5.3). main's
 * release commits move every package to main's version, and the line must
 * keep its own. These hold the two manifest helpers tools/release/sync.mjs
 * runs on every libs/*\/package.json.
 */

const NAMES = ['@nexusdi/core', '@nexusdi/errors'];

describe('restoreWorkspacePins', () => {
  it('puts back the line version and every in-workspace pin, and keeps the rest of the merge', () => {
    const merged = {
      name: '@nexusdi/errors',
      version: '0.3.3',
      dependencies: { '@nexusdi/core': '0.3.3', tslib: '^2.8.1' },
      peerDependencies: { '@nexusdi/core': '0.3.3' },
      description: 'from main',
    };
    const ours = {
      name: '@nexusdi/errors',
      version: '0.4.0-rc.1',
      dependencies: { '@nexusdi/core': '0.4.0-rc.1', tslib: '^2.6.0' },
      peerDependencies: { '@nexusdi/core': '0.4.0-rc.1' },
      description: 'from the line',
    };

    expect(restoreWorkspacePins(merged, ours, NAMES)).toEqual({
      name: '@nexusdi/errors',
      version: '0.4.0-rc.1',
      dependencies: { '@nexusdi/core': '0.4.0-rc.1', tslib: '^2.8.1' },
      peerDependencies: { '@nexusdi/core': '0.4.0-rc.1' },
      description: 'from main',
    });
  });

  it('leaves a workspace dependency the line does not have', () => {
    const merged = {
      version: '0.3.3',
      devDependencies: { '@nexusdi/core': '0.3.3' },
    };
    const ours = { version: '0.4.0' };
    expect(restoreWorkspacePins(merged, ours, NAMES)).toEqual({
      version: '0.4.0',
      devDependencies: { '@nexusdi/core': '0.3.3' },
    });
  });
});

describe('mergeManifests', () => {
  it('takes each side change by key and reports a key both sides changed differently', () => {
    const base = {
      version: '0.3.2',
      description: 'a',
      keywords: ['di'],
      files: ['dist'],
    };
    const ours = {
      version: '0.4.0-rc.0',
      description: 'a',
      keywords: ['di', 'async'],
      files: ['dist'],
    };
    const theirs = {
      version: '0.3.3',
      description: 'b',
      keywords: ['di'],
      files: ['dist', 'README.md'],
    };

    expect(mergeManifests(base, ours, theirs)).toEqual({
      result: {
        version: '0.4.0-rc.0',
        description: 'b',
        keywords: ['di', 'async'],
        files: ['dist', 'README.md'],
      },
      conflicts: ['version'],
    });
  });

  it('merges nested objects key by key', () => {
    const base = { dependencies: { a: '1', b: '1' } };
    const ours = { dependencies: { a: '2', b: '1' } };
    const theirs = { dependencies: { a: '1', b: '3', c: '1' } };
    expect(mergeManifests(base, ours, theirs)).toEqual({
      result: { dependencies: { a: '2', b: '3', c: '1' } },
      conflicts: [],
    });
  });

  it('drops a key one side deleted and the other left alone', () => {
    const base = { a: 1, b: 2 };
    expect(mergeManifests(base, { a: 1 }, { a: 1, b: 2 })).toEqual({
      result: { a: 1 },
      conflicts: [],
    });
  });
});
