import { workspaceRoot } from '@nx/devkit';
import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { specifiersOf } from './core-layers.js';

const libs = readdirSync(join(workspaceRoot, 'libs')).filter(
  (dir) => dir !== 'core',
);

function sourcesOf(dir: string): string[] {
  const src = join(workspaceRoot, 'libs', dir, 'src');
  return readdirSync(src, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('package imports', () => {
  it.each(libs)('lets %s reach core through its package entry only', (dir) => {
    const root = join(workspaceRoot, 'libs', dir);
    const found: string[] = [];
    for (const file of sourcesOf(dir)) {
      const path = relative(root, file).split(sep).join(posix.sep);
      for (const specifier of specifiersOf({
        path,
        source: readFileSync(file, 'utf-8'),
      })) {
        if (
          specifier.startsWith('@nexusdi/core') &&
          specifier !== '@nexusdi/core'
        )
          found.push(`${path} imports ${specifier}`);
        if (
          specifier.startsWith('.') &&
          posix.join(posix.dirname(path), specifier).startsWith('..')
        )
          found.push(`${path} imports ${specifier}, outside the package`);
      }
    }
    expect(found).toEqual([]);
  });
});
