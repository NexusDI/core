import { createProjectGraphAsync, workspaceRoot } from '@nx/devkit';
import { parse } from 'jsonc-parser';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PUBLISH_ROOT,
  publishManifest,
  stagedProblems,
} from '@nexusdi/release';

/**
 * The invariant: the manifest npm publishes carries no workspace-internal
 * field, and every path a published package names exists in the package.
 *
 * The repo's libs/x/package.json lists the `@nexusdi/source` condition first
 * in each exports entry, and `./src/...` paths in `sideEffects`, so the
 * workspace resolves TypeScript source. tools/release/stage.mjs copies the
 * packed package to tmp/publish/<projectRoot> and strips both there, and
 * `nx release publish` publishes that copy.
 */

const source = {
  name: '@nexusdi/decorators',
  version: '0.4.0',
  sideEffects: [
    './src/polyfill/symbol-metadata.ts',
    './dist/polyfill/symbol-metadata.js',
  ],
  types: './dist/index.d.ts',
  exports: {
    './package.json': './package.json',
    '.': {
      '@nexusdi/source': './src/index.ts',
      types: './dist/index.d.ts',
      import: './dist/index.js',
      default: './dist/index.js',
    },
  },
  files: ['dist', 'src'],
};

describe('publishManifest', () => {
  it('drops the @nexusdi/source condition from every exports entry', () => {
    expect(publishManifest(source).exports).toEqual({
      './package.json': './package.json',
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        default: './dist/index.js',
      },
    });
  });

  it('drops the condition from nested condition objects', () => {
    const nested = {
      ...source,
      exports: {
        '.': {
          node: { '@nexusdi/source': './src/node.ts', default: './dist/n.js' },
          default: './dist/index.js',
        },
      },
    };
    expect(publishManifest(nested).exports).toEqual({
      '.': { node: { default: './dist/n.js' }, default: './dist/index.js' },
    });
  });

  it('drops the ./src/ sideEffects entries and keeps the dist ones', () => {
    expect(publishManifest(source).sideEffects).toEqual([
      './dist/polyfill/symbol-metadata.js',
    ]);
  });

  it('leaves a boolean sideEffects and every other field alone', () => {
    const plain = { ...source, sideEffects: false };
    const out = publishManifest(plain);
    expect(out.sideEffects).toBe(false);
    expect(out.files).toEqual(source.files);
    expect(out.version).toBe('0.4.0');
  });

  it('does not change the manifest it reads', () => {
    const copy = structuredClone(source);
    publishManifest(source);
    expect(source).toEqual(copy);
  });
});

/** A staged package: its files and their contents. */
function staged(files: Record<string, string>) {
  return {
    files: Object.keys(files),
    read: (path: string) => files[path] ?? '',
  };
}

const complete = {
  'package.json': '',
  'README.md': '',
  LICENSE: '',
  'CHANGELOG.md': '',
  'src/index.ts': '',
  'src/polyfill/symbol-metadata.ts': '',
  'dist/index.js': 'export {};\n//# sourceMappingURL=index.js.map',
  'dist/index.js.map': JSON.stringify({ sources: ['../src/index.ts'] }),
  'dist/index.d.ts': 'export {};\n//# sourceMappingURL=index.d.ts.map',
  'dist/index.d.ts.map': JSON.stringify({ sources: ['../src/index.ts'] }),
  'dist/polyfill/symbol-metadata.js': '',
};

/** `files` without the one at `path`. */
function without(files: Record<string, string>, path: string) {
  return Object.fromEntries(
    Object.entries(files).filter(([name]) => name !== path),
  );
}

describe('stagedProblems', () => {
  const manifest = publishManifest(source);

  it('passes a complete stripped package', () => {
    expect(
      stagedProblems({ manifest, repoVersion: '0.4.0', ...staged(complete) }),
    ).toEqual([]);
  });

  it('reports the @nexusdi/source condition left in the manifest', () => {
    const problems = stagedProblems({
      manifest: source,
      repoVersion: '0.4.0',
      ...staged(complete),
    });
    expect(problems).toContainEqual(expect.stringContaining('@nexusdi/source'));
  });

  it('reports an exports, types or sideEffects target missing from the package', () => {
    const rest = without(complete, 'dist/index.js');
    const problems = stagedProblems({
      manifest: { ...manifest, sideEffects: ['./dist/gone.js'] },
      repoVersion: '0.4.0',
      ...staged(rest),
    });
    expect(problems).toContainEqual(expect.stringContaining('./dist/index.js'));
    expect(problems).toContainEqual(expect.stringContaining('./dist/gone.js'));
  });

  it('reports a bin target missing from the package', () => {
    const problems = stagedProblems({
      manifest: { ...manifest, bin: { nexusdi: './dist/bin.js' } },
      repoVersion: '0.4.0',
      ...staged(complete),
    });
    expect(problems).toContainEqual(expect.stringContaining('./dist/bin.js'));
  });

  it('reports a map whose source is not shipped', () => {
    const problems = stagedProblems({
      manifest,
      repoVersion: '0.4.0',
      ...staged({
        ...complete,
        'dist/index.d.ts.map': JSON.stringify({ sources: ['../src/gone.ts'] }),
      }),
    });
    expect(problems).toEqual([
      expect.stringMatching(/dist\/index\.d\.ts\.map.*src\/gone\.ts/),
    ]);
  });

  it('reports a sourceMappingURL whose map is not shipped', () => {
    const rest = without(complete, 'dist/index.js.map');
    const problems = stagedProblems({
      manifest,
      repoVersion: '0.4.0',
      ...staged(rest),
    });
    expect(problems).toEqual([
      expect.stringMatching(/dist\/index\.js.*dist\/index\.js\.map/),
    ]);
  });

  it('resolves map sources against the map sourceRoot', () => {
    const problems = stagedProblems({
      manifest,
      ...staged({
        ...complete,
        'dist/index.d.ts.map': JSON.stringify({
          sourceRoot: '../src/',
          sources: ['index.ts'],
        }),
      }),
    });
    expect(problems).toEqual([]);
  });

  it('skips a folder export, which names no single file', () => {
    expect(
      stagedProblems({
        manifest: { ...manifest, exports: { './dist/': './dist/' } },
        ...staged(complete),
      }),
    ).toEqual([]);
  });

  it('skips the version check when no repo version is given', () => {
    expect(
      stagedProblems({
        manifest: { ...manifest, version: '9.9.9' },
        ...staged(complete),
      }),
    ).toEqual([]);
  });

  it('reports a missing README, LICENSE or CHANGELOG', () => {
    const rest = without(complete, 'LICENSE');
    expect(
      stagedProblems({ manifest, repoVersion: '0.4.0', ...staged(rest) }),
    ).toEqual([expect.stringContaining('LICENSE')]);
  });

  it('reports a version that differs from the repo manifest', () => {
    expect(
      stagedProblems({ manifest, repoVersion: '0.5.0', ...staged(complete) }),
    ).toEqual([expect.stringContaining('0.5.0')]);
  });
});

describe('the publish wiring', () => {
  it('stages every released library and publishes the staged copy', async () => {
    const graph = await createProjectGraphAsync({ exitOnError: true });
    const libs = Object.values(graph.nodes).filter((node) =>
      node.data.root.startsWith('libs/'),
    );
    expect(libs.length).toBeGreaterThan(0);
    for (const lib of libs) {
      const targets = lib.data.targets ?? {};
      expect(targets['stage-publish']?.dependsOn, lib.name).toContain('build');
      expect(targets['stage-publish']?.cache, lib.name).toBe(false);
      expect(targets['nx-release-publish']?.dependsOn, lib.name).toContain(
        'stage-publish',
      );
      expect(targets['nx-release-publish']?.options?.packageRoot).toBe(
        `${PUBLISH_ROOT}/${lib.data.root}`,
      );
    }
  });
});

describe('the shipped maps', () => {
  // Each package ships src next to dist, and its declaration and source maps
  // lead an editor's Go to Definition and a --enable-source-maps stack trace
  // into that src. The maps carry no sourcesContent: the files they name ship.
  const libs = readdirSync(join(workspaceRoot, 'libs'));

  it.each(libs)('libs/%s/tsconfig.lib.json emits both maps', (lib) => {
    const options = parse(
      readFileSync(
        join(workspaceRoot, 'libs', lib, 'tsconfig.lib.json'),
        'utf8',
      ),
    ).compilerOptions;
    expect(options.declarationMap).toBe(true);
    expect(options.sourceMap).toBe(true);
    expect(options.inlineSources).not.toBe(true);
  });
});
