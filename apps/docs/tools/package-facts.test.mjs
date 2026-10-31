// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dependencyCount, workspacePackages } from './package-facts.mjs';

const workspace = () => {
  const root = mkdtempSync(join(tmpdir(), 'nexusdi-facts-'));
  const lib = (dir, json) => {
    mkdirSync(join(root, 'libs', dir), { recursive: true });
    writeFileSync(
      join(root, 'libs', dir, 'package.json'),
      JSON.stringify(json),
    );
  };
  mkdirSync(join(root, 'apps', 'docs', 'content'), { recursive: true });
  lib('core', { name: '@nexusdi/core', description: 'The core.' });
  lib('errors', {
    name: '@nexusdi/errors',
    description: 'Errors.',
    dependencies: { left: '1.0.0' },
  });
  lib('hidden', { name: '@nexusdi/hidden', private: true });
  writeFileSync(
    join(root, 'apps', 'docs', 'content', 'api-errors-package.mdx'),
    "---\ntitle: x\npackage: '@nexusdi/errors'\n---\n",
  );
  return root;
};

describe('package facts', () => {
  it('counts the runtime dependencies of a package', () => {
    const root = workspace();
    expect(dependencyCount(root)).toBe(0);
    expect(dependencyCount(root, 'errors')).toBe(1);
  });

  it('lists published packages with core first and the page that claims each', () => {
    expect(workspacePackages(workspace())).toEqual([
      {
        name: '@nexusdi/core',
        description: 'The core.',
        npm: 'https://www.npmjs.com/package/@nexusdi/core',
        docs: undefined,
        required: true,
      },
      {
        name: '@nexusdi/errors',
        description: 'Errors.',
        npm: 'https://www.npmjs.com/package/@nexusdi/errors',
        docs: '/api-errors-package/',
        required: false,
      },
    ]);
  });
});
