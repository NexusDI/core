import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import {
  BANNED,
  BANNED_PROSE,
  bannedProse,
  bannedRaw,
  proseOf,
  readmeFaults,
  repoRef,
  type ReadmeInput,
  type Rule,
} from './npm-readmes.js';
import { PACKAGES, type Package } from './npm-readmes-data.js';

const FIXTURES = join(import.meta.dirname, '__fixtures__', 'npm-readmes');
const PASS = join(FIXTURES, 'pass');

type Name = Package | 'root';

/** One README of the tree under `root`, read the way the checks expect it. */
function inputFrom(
  root: string,
  name: Name,
  version: string,
  peers: readonly string[],
): ReadmeInput {
  const dir = name === 'root' ? root : join(root, 'libs', name);
  const docsDir = join(dir, 'docs');
  const docs =
    name !== 'root' && existsSync(docsDir)
      ? readdirSync(docsDir)
          .filter((file) => file.endsWith('.md'))
          .sort()
          .map((file) => ({
            file: `docs/${file}`,
            source: readFileSync(join(docsDir, file), 'utf8'),
          }))
      : [];
  return {
    name,
    source: readFileSync(join(dir, 'README.md'), 'utf8'),
    version,
    peers,
    docs,
    core: readFileSync(join(root, 'libs', 'core', 'README.md'), 'utf8'),
    exists: (path) => existsSync(join(root, path)),
  };
}

const FIXTURE_PEERS: Readonly<Partial<Record<Name, readonly string[]>>> = {
  errors: ['core'],
  devtools: ['core'],
  cli: ['core', 'devtools'],
};

function fixture(name: Name, version = '0.4.0-rc.1'): ReadmeInput {
  return inputFrom(PASS, name, version, FIXTURE_PEERS[name] ?? []);
}

function rulesOf(input: ReadmeInput): Rule[] {
  return [...new Set(readmeFaults(input).map((fault) => fault.rule))].sort();
}

interface FailingFixture {
  rule: Rule;
  why: string;
  name: Name;
  /** A docs file to change, relative to the package; the README when absent. */
  file?: string;
  replace: [from: string, to: string][];
}

const failing = JSON.parse(
  readFileSync(join(FIXTURES, 'failing.json'), 'utf8'),
) as FailingFixture[];

const banned = JSON.parse(
  readFileSync(join(FIXTURES, 'banned.json'), 'utf8'),
) as Record<'raw' | 'prose', { name: string; hit: string; miss: string }[]>;

describe('readmeFaults', () => {
  it.each(['core', 'root', 'errors', 'devtools', 'cli'] as const)(
    'finds no fault in the passing %s fixture',
    (name) => {
      expect(readmeFaults(fixture(name))).toEqual([]);
    },
  );

  it.each(failing)('reports $rule, and only $rule, when $why', (fixed) => {
    const base = fixture(fixed.name);
    let source = base.source;
    let docs = base.docs;
    for (const [from, to] of fixed.replace) {
      if (fixed.file === undefined) {
        expect(source).toContain(from);
        source = source.replace(from, to);
      } else {
        const doc = docs.find((d) => d.file === fixed.file);
        expect(doc?.source).toContain(from);
        docs = docs.map((d) =>
          d.file === fixed.file
            ? { ...d, source: d.source.replace(from, to) }
            : d,
        );
      }
    }
    expect(rulesOf({ ...base, source, docs })).toEqual([fixed.rule]);
  });

  it('holds one failing fixture for every rule', () => {
    const rules: Rule[] = [
      'headings',
      'length',
      'hero',
      'badges',
      'tagline',
      'ingress',
      'bullets',
      'rc-notice',
      'install',
      'documentation',
      'repo-urls',
      'images',
      'license',
      'doctests',
      'regions',
      'root-copy',
      'packages',
      'banned',
      'banned-prose',
    ];
    expect([...new Set(failing.map((f) => f.rule))].sort()).toEqual(
      rules.sort(),
    );
  });

  it('asks for the GA form once the version has no prerelease part', () => {
    expect(rulesOf(fixture('errors', '0.4.0'))).toEqual([
      'documentation',
      'install',
      'rc-notice',
      'repo-urls',
    ]);
  });

  it('asks the root README for the shared part of core', () => {
    const root = fixture('root');
    expect(
      rulesOf({ ...root, core: root.core?.replace('No runtime', 'Zero') }),
    ).toEqual(['root-copy']);
  });
});

describe('repoRef', () => {
  it('names the release branch while the version is a prerelease', () => {
    expect(repoRef('0.4.0-rc.1')).toBe('release/0.4');
  });

  it('names main for a final version', () => {
    expect(repoRef('0.4.0')).toBe('main');
  });
});

describe('proseOf', () => {
  it('keeps link text and table cells, and drops link targets and alt text', () => {
    expect(
      proseOf(
        '[the docs](https://lands.example) <img alt="lands" src="x">\n| lands |',
      ),
    ).toBe('the docs <img>\n| lands |');
  });

  it('keeps the line numbers of the README', () => {
    const source = '```ts\nconst a = 1;\n```\n<!--\nnote\n-->\nThe end.';
    expect(proseOf(source).split('\n')).toHaveLength(7);
    expect(proseOf(source).split('\n')[6]).toBe('The end.');
  });
});

describe('the banned patterns', () => {
  it.each(banned.raw)('finds $name in the raw file', ({ name, hit, miss }) => {
    expect(bannedRaw(hit).map((h) => h.split(' at line ')[0])).toEqual([name]);
    expect(bannedRaw(miss)).toEqual([]);
  });

  it.each(banned.prose)('finds $name in prose only', ({ name, hit, miss }) => {
    expect(bannedProse(hit).map((h) => h.split(' at line ')[0])).toEqual([
      name,
    ]);
    expect(bannedProse(miss)).toEqual([]);
  });

  it('holds a hit and a miss for every pattern', () => {
    expect(new Set(banned.raw.map((c) => c.name))).toEqual(
      new Set(BANNED.map((p) => p.name)),
    );
    expect(new Set(banned.prose.map((c) => c.name))).toEqual(
      new Set(BANNED_PROSE.map((p) => p.name)),
    );
  });
});

/**
 * The READMEs in libs/ and the root. These fail until the README rewrite
 * is merged. Each failure names the rule, and the line where it has one.
 */
describe('published READMEs', () => {
  const manifest = (name: Package) =>
    JSON.parse(
      readFileSync(join(workspaceRoot, 'libs', name, 'package.json'), 'utf8'),
    ) as { version: string; peerDependencies?: Record<string, string> };

  function workspaceInput(name: Name): ReadmeInput {
    const pkg = name === 'root' ? 'core' : name;
    const { version, peerDependencies = {} } = manifest(pkg);
    const peers = Object.keys(peerDependencies)
      .filter((dep) => dep.startsWith('@nexusdi/'))
      .map((dep) => dep.slice('@nexusdi/'.length));
    return inputFrom(workspaceRoot, name, version, peers);
  }

  it.each([...PACKAGES, 'root' as const])(
    'follows the npm README standard: %s',
    (name) => {
      expect(
        readmeFaults(workspaceInput(name)).map(
          (fault) => `[${fault.rule}] ${fault.message}`,
        ),
      ).toEqual([]);
    },
  );
});
