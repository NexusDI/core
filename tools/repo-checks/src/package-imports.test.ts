import { workspaceRoot } from '@nx/devkit';
import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { specifiersOf, type SourceFileText } from './core-layers.js';

const libs = readdirSync(join(workspaceRoot, 'libs')).filter(
  (dir) => dir !== 'core',
);

/**
 * The core entries each package may import. Every package imports
 * `@nexusdi/core`; only the errors engine formats with core's text pack.
 */
function coreEntriesOf(dir: string): readonly string[] {
  return dir === 'errors'
    ? ['@nexusdi/core', '@nexusdi/core/text']
    : ['@nexusdi/core'];
}

/** Each import in `files` of package `dir` that reaches past its allowed core entries or out of the package. */
function importViolations(
  dir: string,
  files: readonly SourceFileText[],
): string[] {
  const allowed = coreEntriesOf(dir);
  const found: string[] = [];
  for (const file of files) {
    for (const specifier of specifiersOf(file)) {
      if (specifier.startsWith('@nexusdi/core') && !allowed.includes(specifier))
        found.push(`${file.path} imports ${specifier}`);
      if (
        specifier.startsWith('.') &&
        posix.join(posix.dirname(file.path), specifier).startsWith('..')
      )
        found.push(`${file.path} imports ${specifier}, outside the package`);
    }
  }
  return found;
}

function sourcesOf(dir: string): SourceFileText[] {
  const root = join(workspaceRoot, 'libs', dir);
  return readdirSync(join(root, 'src'), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name))
    .map((file) => ({
      path: relative(root, file).split(sep).join(posix.sep),
      source: readFileSync(file, 'utf-8'),
    }));
}

describe('package imports', () => {
  it.each(libs)('lets %s reach core through its package entry only', (dir) => {
    expect(importViolations(dir, sourcesOf(dir))).toEqual([]);
  });

  it('lets errors import @nexusdi/core/text', () => {
    expect(
      importViolations('errors', [
        {
          path: 'src/explain.ts',
          source: "import { coreText } from '@nexusdi/core/text';",
        },
      ]),
    ).toEqual([]);
  });

  it('reports @nexusdi/core/text in any other package', () => {
    expect(
      importViolations('devtools', [
        {
          path: 'src/inspect.ts',
          source: "import { coreText } from '@nexusdi/core/text';",
        },
      ]),
    ).toEqual(['src/inspect.ts imports @nexusdi/core/text']);
  });
});
