import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import {
  coreNamesNoPackage,
  pluginNameLiterals,
} from './core-names-no-package.js';
import { parse } from './core-layers.js';
import { sourcesOf } from './entry-graph.js';

// The fixtures name packages under '@acme/', a scope nothing resolves. A
// '@nexusdi/errors' specifier would make the project graph read the
// fixtures as a dependency of repo-checks on errors.
const FIXTURES = join(
  import.meta.dirname,
  '__fixtures__',
  'core-names-no-package',
);

const fixture = (name: string) => sourcesOf(join(FIXTURES, name));

describe('pluginNameLiterals', () => {
  it('finds each string and template head that starts with nexus:', () => {
    expect(
      pluginNameLiterals(parse(fixture('sabotaged'))).map((node) => node.text),
    ).toEqual(['nexus:errors', 'nexus:']);
  });
});

describe('coreNamesNoPackage', () => {
  it('accepts core naming itself, and ignores comments and tests', () => {
    expect(coreNamesNoPackage(fixture('clean'), '@acme').violations).toEqual(
      [],
    );
  });

  it('reports every way core names another package or its own subpath', () => {
    expect(
      coreNamesNoPackage(fixture('sabotaged'), '@acme').violations.filter(
        (violation) => violation.startsWith('imports.ts'),
      ),
    ).toEqual([
      'imports.ts imports @acme/errors; core names no other package',
      'imports.ts imports @acme/core/text; core names no other package',
      'imports.ts imports @acme/devtools; core names no other package',
      'imports.ts imports @acme/testing; core names no other package',
      'imports.ts imports @acme/federation; core names no other package',
      'imports.ts imports @acme/node; core names no other package',
    ]);
  });

  it('reports a plugin name and another package named in a string', () => {
    expect(
      coreNamesNoPackage(fixture('sabotaged'), '@acme').violations.filter(
        (violation) => violation.startsWith('names.ts'),
      ),
    ).toEqual([
      "names.ts:6 writes the plugin name 'nexus:errors'; core names no plugin",
      "names.ts:8 writes the plugin name 'nexus:'; core names no plugin",
      "names.ts:10 names @acme/errors in 'install @acme/errors for the full text'; core names no other package",
    ]);
  });

  it('holds for libs/core/src, with files, modules and strings to check', () => {
    const live = coreNamesNoPackage(
      sourcesOf(join(workspaceRoot, 'libs', 'core', 'src')),
    );
    expect(live.scanned.files).toBeGreaterThan(0);
    expect(live.scanned.modules).toBeGreaterThan(0);
    expect(live.scanned.strings).toBeGreaterThan(0);
    expect(live.violations).toEqual([]);
  });
});
