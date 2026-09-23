import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

/**
 * The docs projects are not released, so `commitlint-scope-enum.test.ts`
 * never asks for their scopes. A commit to one of them still needs a scope the
 * commit-msg hook accepts, and CONTRIBUTING.md is where a person looks it up.
 */
const DOCS_SCOPES = [
  'docs',
  'docs-e2e',
  'meridian-ui',
  'meridian',
  'doc-examples',
] as const;

const require_ = createRequire(import.meta.url);

function scopeEnum(): string[] {
  const config = require_(join(workspaceRoot, 'commitlint.config.js')) as {
    rules: Record<string, [number, string, string[]]>;
  };
  return config.rules['scope-enum']?.[2] ?? [];
}

describe('docs project scopes', () => {
  it('are all in commitlint scope-enum', () => {
    const missing = DOCS_SCOPES.filter((scope) => !scopeEnum().includes(scope));
    expect(missing, 'Add these to scope-enum in commitlint.config.js.').toEqual(
      [],
    );
  });

  it('are all listed in CONTRIBUTING.md', () => {
    const contributing = readFileSync(
      join(workspaceRoot, 'CONTRIBUTING.md'),
      'utf8',
    );
    const missing = DOCS_SCOPES.filter(
      (scope) => !contributing.includes(`- **${scope}**:`),
    );
    expect(missing, 'List these under Scopes in CONTRIBUTING.md.').toEqual([]);
  });

  it('keeps apps and internal in the npm workspaces', () => {
    const pkg = JSON.parse(
      readFileSync(join(workspaceRoot, 'package.json'), 'utf8'),
    ) as { workspaces: string[] };
    expect(pkg.workspaces).toEqual(
      expect.arrayContaining(['apps/*', 'internal/*']),
    );
  });
});
