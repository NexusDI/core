import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import {
  entryGraphViolations,
  ownSubpathModules,
  resolveRelative,
  sourcesOf,
} from './entry-graph.js';

const FIXTURES = join(import.meta.dirname, '__fixtures__', 'entry-graph');
const LIBS = join(workspaceRoot, 'libs');

const fixture = (name: string) => sourcesOf(join(FIXTURES, name));

describe('sourcesOf', () => {
  it('reads every .ts file but tests, with paths relative to the folder', () => {
    const paths = sourcesOf(join(LIBS, 'errors', 'src')).map((f) => f.path);
    expect(paths).toContain('index.ts');
    expect(paths.filter((path) => path.includes('.test'))).toEqual([]);
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

  const packages = readdirSync(LIBS).filter((dir) =>
    existsSync(join(LIBS, dir, 'src', 'index.ts')),
  );

  it.each(packages)('holds for libs/%s', (dir) => {
    const manifest = JSON.parse(
      readFileSync(join(LIBS, dir, 'package.json'), 'utf8'),
    ) as { exports?: unknown };
    expect(
      entryGraphViolations(
        sourcesOf(join(LIBS, dir, 'src')),
        ownSubpathModules(manifest.exports),
      ),
    ).toEqual([]);
  });
});
