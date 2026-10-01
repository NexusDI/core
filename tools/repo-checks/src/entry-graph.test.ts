import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { parse, resolveRelative } from './core-layers.js';
import {
  entryGraphViolations,
  filesUnder,
  libPackages,
  mainEntryOf,
  ownSubpathModules,
  sourcesOf,
  walkEntry,
} from './entry-graph.js';

const FIXTURES = join(import.meta.dirname, '__fixtures__', 'entry-graph');
const LIBS = join(workspaceRoot, 'libs');

const fixture = (name: string) => sourcesOf(join(FIXTURES, name));

describe('filesUnder', () => {
  it('lists every file, tests included, sorted and relative to the root', () => {
    expect(filesUnder(join(FIXTURES, 'clean', 'devtools'), FIXTURES)).toEqual([
      'clean/devtools/notes.ts',
    ]);
    expect(filesUnder(join(FIXTURES, 'clean'))).toEqual([
      'devtools/notes.ts',
      'feature.ts',
      'index.ts',
      'shared.ts',
      'text.ts',
    ]);
  });

  it('lists nothing for a folder that does not exist', () => {
    expect(filesUnder(join(FIXTURES, 'missing'))).toEqual([]);
  });
});

describe('walkEntry', () => {
  it('yields each module the entry reaches by value, with its chain, and stops where told', () => {
    expect([
      ...walkEntry(
        parse(fixture('sabotaged/text-file')),
        'index.ts',
        (path) => path === 'feature.ts',
      ),
    ]).toEqual([
      { kind: 'module', path: 'index.ts', chain: 'index.ts' },
      { kind: 'module', path: 'feature.ts', chain: 'index.ts > feature.ts' },
    ]);
  });

  it('yields an import it cannot resolve', () => {
    expect([
      ...walkEntry(parse(fixture('sabotaged/unresolved')), 'index.ts'),
    ]).toEqual([
      { kind: 'module', path: 'index.ts', chain: 'index.ts' },
      { kind: 'unresolved', path: 'index.ts', specifier: './feature.js' },
    ]);
  });
});

describe('sourcesOf', () => {
  it('reads every .ts file but tests, with paths relative to the folder', () => {
    const paths = sourcesOf(join(LIBS, 'errors', 'src')).map((f) => f.path);
    expect(paths).toContain('index.ts');
    expect(paths.filter((path) => path.includes('.test'))).toEqual([]);
  });
});

describe('libPackages', () => {
  it('reads each package folder, with no sources for a package without src/', () => {
    const libs = mkdtempSync(join(tmpdir(), 'lib-packages-'));
    mkdirSync(join(libs, 'cache', 'src'), { recursive: true });
    writeFileSync(
      join(libs, 'cache', 'package.json'),
      JSON.stringify({ name: '@acme/cache', exports: { './text': './x' } }),
    );
    writeFileSync(join(libs, 'cache', 'src', 'index.ts'), 'export {};\n');
    mkdirSync(join(libs, 'types'));
    writeFileSync(
      join(libs, 'types', 'package.json'),
      JSON.stringify({ name: '@acme/types' }),
    );
    mkdirSync(join(libs, 'scratch'));
    expect(
      libPackages(libs).map(({ name, exports, files }) => ({
        name,
        exports,
        files: files.map((file) => file.path),
      })),
    ).toEqual([
      {
        name: '@acme/cache',
        exports: { './text': './x' },
        files: ['index.ts'],
      },
      { name: '@acme/types', exports: undefined, files: [] },
    ]);
  });
});

describe('resolveRelative', () => {
  const paths = new Set(['index.ts', 'text/index.ts', 'feature.ts']);

  it('maps a .js specifier to its .ts file', () => {
    expect(resolveRelative('index.ts', './feature.js', paths)).toBe(
      'feature.ts',
    );
  });

  it('maps a folder specifier to its index.ts', () => {
    expect(resolveRelative('feature.ts', './text', paths)).toBe(
      'text/index.ts',
    );
  });

  it('returns null for a file that is not there', () => {
    expect(resolveRelative('index.ts', './missing.js', paths)).toBeNull();
  });
});

describe('mainEntryOf', () => {
  it('reads the source of the . export, relative to src/', () => {
    expect(mainEntryOf({ '.': { '@nexusdi/source': './src/main.ts' } })).toBe(
      'main.ts',
    );
  });

  it('returns null for a package with no . export', () => {
    expect(mainEntryOf({ './package.json': './package.json' })).toBeNull();
    expect(mainEntryOf(undefined)).toBeNull();
  });

  it('throws for a . export without a @nexusdi/source file', () => {
    expect(() => mainEntryOf({ '.': { default: './dist/index.js' } })).toThrow(
      'exports . has no @nexusdi/source file',
    );
  });
});

describe('ownSubpathModules', () => {
  it('names text.ts, text/ and devtools/ for a package with no subpaths', () => {
    expect(ownSubpathModules({ '.': './src/index.ts' })).toEqual([
      'text.ts',
      'text/',
      'devtools/',
    ]);
  });

  it('adds the source module of a ./text or ./devtools export', () => {
    expect(
      ownSubpathModules({
        '.': { '@nexusdi/source': './src/index.ts' },
        './text': { '@nexusdi/source': './src/packs/text.ts' },
        './devtools': { '@nexusdi/source': './src/notes/index.ts' },
      }),
    ).toEqual(['text.ts', 'text/', 'devtools/', 'packs/text.ts', 'notes/']);
  });
});

describe('entryGraphViolations', () => {
  it('accepts a main entry that names text and devtools modules in types only', () => {
    expect(entryGraphViolations(fixture('clean'))).toEqual([]);
  });

  it('reports a main entry that reaches text.ts through another module', () => {
    expect(entryGraphViolations(fixture('sabotaged/text-file'))).toEqual([
      'index.ts reaches text.ts (index.ts > feature.ts > text.ts), and the main entry may not import the package text or devtools module',
    ]);
  });

  it('reports a main entry that re-exports text/', () => {
    expect(entryGraphViolations(fixture('sabotaged/text-folder'))).toEqual([
      'index.ts reaches text/index.ts (index.ts > text/index.ts), and the main entry may not import the package text or devtools module',
    ]);
  });

  it('reports a main entry that loads devtools/ with import()', () => {
    expect(entryGraphViolations(fixture('sabotaged/devtools-folder'))).toEqual([
      'index.ts reaches devtools/notes.ts (index.ts > devtools/notes.ts), and the main entry may not import the package text or devtools module',
    ]);
  });

  it('reports a relative import it cannot resolve, since it cannot walk past it', () => {
    expect(entryGraphViolations(fixture('sabotaged/unresolved'))).toEqual([
      'index.ts imports ./feature.js, which resolves to no file under src/',
    ]);
  });

  it('walks from the entry it is given', () => {
    expect(
      entryGraphViolations(
        fixture('sabotaged/text-file'),
        undefined,
        'feature.ts',
      ),
    ).toEqual([
      'feature.ts reaches text.ts (feature.ts > text.ts), and the main entry may not import the package text or devtools module',
    ]);
  });

  it('reports a main entry whose file is missing', () => {
    expect(
      entryGraphViolations(fixture('clean'), undefined, 'main.ts'),
    ).toEqual(['src/main.ts is missing, so the main entry cannot be walked']);
  });

  it.each(libPackages(LIBS).map((pkg) => [pkg.dir, pkg] as const))(
    'holds for libs/%s',
    (_, pkg) => {
      const entry = mainEntryOf(pkg.exports);
      if (entry === null) return;
      expect(
        entryGraphViolations(pkg.files, ownSubpathModules(pkg.exports), entry),
      ).toEqual([]);
    },
  );
});
