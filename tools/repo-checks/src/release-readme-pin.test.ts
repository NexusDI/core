import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { parseJson, workspaceRoot } from '@nx/devkit';
import { createTree } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';

import { pinRepoUrls, repoUrlFor } from '@nexusdi/release';
import NexusVersionActions, {
  afterAllProjectsVersioned,
} from '@nexusdi/release/version-actions';

/**
 * Every package README names its own release tag in its image and Examples
 * URLs (tools/repo-checks/src/npm-readmes.ts, check 8). nx's version step
 * runs tools/release/version-actions.mjs, which rewrites those URLs to the
 * new version in the same tree as package.json, so the release commit and
 * its tag carry READMEs that name that tag.
 */

const RAW = 'https://raw.githubusercontent.com/NexusDI/core/refs/tags/';
const TREE = 'https://github.com/NexusDI/core/tree/';
const BLOB = 'https://github.com/NexusDI/core/blob/';
const LOGO = 'https://raw.githubusercontent.com/NexusDI/core/main/logo.svg';
const LICENSE = 'https://github.com/NexusDI/core/blob/main/LICENSE';

// @nx/js is CommonJS, so the class is its `default` property.
const js = createRequire(import.meta.url)(
  '@nx/js/src/release/version-actions',
) as typeof import('@nx/js/src/release/version-actions');

describe('repoUrlFor', () => {
  it('names the release tag under refs/tags/ on raw.githubusercontent.com', () => {
    expect(
      repoUrlFor({
        kind: 'raw',
        version: '0.4.0-rc.1',
        path: 'libs/devtools/assets/graph.svg',
      }),
    ).toBe(`${RAW}@nexusdi/core@0.4.0-rc.1/libs/devtools/assets/graph.svg`);
  });

  it('names the release tag the way GitHub links a tag tree or blob', () => {
    expect(
      repoUrlFor({ kind: 'tree', version: '0.4.0', path: 'libs/core/docs' }),
    ).toBe(`${TREE}@nexusdi/core@0.4.0/libs/core/docs`);
    expect(
      repoUrlFor({ kind: 'blob', version: '0.4.0', path: 'libs/core/a.ts' }),
    ).toBe(`${BLOB}@nexusdi/core@0.4.0/libs/core/a.ts`);
  });
});

describe('pinRepoUrls', () => {
  it('moves raw, tree and blob URLs to the version', () => {
    const before = [
      `<img src="${RAW}@nexusdi/core@0.4.0-rc.0/libs/devtools/assets/graph.svg" alt="graph">`,
      `- [Examples](${TREE}@nexusdi/core@0.4.0-rc.0/libs/devtools/docs)`,
      `See [the source](${BLOB}@nexusdi/core@0.3.2/libs/core/src/index.ts).`,
    ].join('\n');
    expect(pinRepoUrls(before, '0.4.0-rc.1')).toBe(
      [
        `<img src="${RAW}@nexusdi/core@0.4.0-rc.1/libs/devtools/assets/graph.svg" alt="graph">`,
        `- [Examples](${TREE}@nexusdi/core@0.4.0-rc.1/libs/devtools/docs)`,
        `See [the source](${BLOB}@nexusdi/core@0.4.0-rc.1/libs/core/src/index.ts).`,
      ].join('\n'),
    );
  });

  it('leaves the logo, the LICENSE link, branch URLs and other repositories alone', () => {
    const text = [
      `<img src="${LOGO}" alt="NexusDI">`,
      `[license](${LICENSE})`,
      `${TREE}release/0.4/libs/core/docs`,
      `https://raw.githubusercontent.com/NexusDI/core/release/0.4/libs/devtools/assets/graph.svg`,
      `https://github.com/NexusDI/core/tree/refs/tags/@nexusdi/core@0.4.0-rc.0/libs/core/docs`,
      `https://raw.githubusercontent.com/NexusDI/core/@nexusdi/core@0.4.0-rc.0/logo.svg`,
      `https://github.com/someone/else/tree/@nexusdi/core@0.4.0-rc.0/libs/core/docs`,
    ].join('\n');
    expect(pinRepoUrls(text, '0.4.0-rc.1')).toBe(text);
  });

  it('changes nothing the second time', () => {
    const once = pinRepoUrls(
      `${TREE}@nexusdi/core@0.4.0-rc.0/libs/core/docs`,
      '0.4.0-rc.1',
    );
    expect(pinRepoUrls(once, '0.4.0-rc.1')).toBe(once);
  });

  it.each(['raw', 'tree', 'blob'] as const)(
    'keeps a %s URL from repoUrlFor at its own version',
    (kind) => {
      const url = repoUrlFor({ kind, version: '0.5.0-rc.2', path: 'a/b.svg' });
      expect(pinRepoUrls(url, '0.5.0-rc.2')).toBe(url);
    },
  );
});

describe("nx's version step", () => {
  it('runs tools/release/version-actions.mjs', () => {
    const nxJson = parseJson<{
      release?: { version?: { versionActions?: string } };
    }>(readFileSync(join(workspaceRoot, 'nx.json'), 'utf-8'), {
      expectComments: true,
    });
    expect(nxJson.release?.version?.versionActions).toBe(
      './tools/release/version-actions.mjs',
    );
  });

  it("extends @nx/js's actions and keeps its lockfile update", () => {
    expect(Object.getPrototypeOf(NexusVersionActions)).toBe(js.default);
    expect(afterAllProjectsVersioned).toBe(js.afterAllProjectsVersioned);
  });

  /** The actions for one project, with its README and package.json at rc.0. */
  function actionsFor(root: string, files: Record<string, string>) {
    const tree = createTree();
    for (const [path, text] of Object.entries(files)) tree.write(path, text);
    tree.write(
      `${root}/package.json`,
      JSON.stringify({ name: 'x', version: '0.4.0-rc.0' }),
    );
    const actions = new NexusVersionActions(
      { name: '__default__' } as never,
      { name: root, type: 'lib', data: { root } } as never,
      {} as never,
    );
    actions.manifestsToUpdate = [
      {
        manifestPath: `${root}/package.json`,
        preserveLocalDependencyProtocols: false,
      },
    ];
    return { tree, actions };
  }

  const examples = (version: string, pkg: string) =>
    `- [Examples](${TREE}@nexusdi/core@${version}/libs/${pkg}/docs)\n`;

  it("pins the package's README to the new version beside its package.json", async () => {
    const { tree, actions } = actionsFor('libs/devtools', {
      'libs/devtools/README.md': examples('0.4.0-rc.0', 'devtools'),
      'README.md': examples('0.4.0-rc.0', 'core'),
    });
    const logs = await actions.updateProjectVersion(tree, '0.4.0-rc.1');

    expect(tree.read('libs/devtools/README.md', 'utf-8')).toBe(
      examples('0.4.0-rc.1', 'devtools'),
    );
    expect(
      JSON.parse(tree.read('libs/devtools/package.json', 'utf-8') ?? ''),
    ).toMatchObject({ version: '0.4.0-rc.1' });
    expect(tree.read('README.md', 'utf-8')).toBe(
      examples('0.4.0-rc.0', 'core'),
    );
    expect(logs).toContain(
      'Pinned repo URLs in libs/devtools/README.md to 0.4.0-rc.1',
    );
  });

  it("pins core's README and leaves the root README, which has no tag URL", async () => {
    const { tree, actions } = actionsFor('libs/core', {
      'libs/core/README.md': examples('0.4.0-rc.0', 'core'),
      'README.md': examples('0.4.0-rc.0', 'core'),
    });
    await actions.updateProjectVersion(tree, '0.4.0-rc.1');

    expect(tree.read('libs/core/README.md', 'utf-8')).toBe(
      examples('0.4.0-rc.1', 'core'),
    );
    expect(tree.read('README.md', 'utf-8')).toBe(
      examples('0.4.0-rc.0', 'core'),
    );
  });

  it('logs nothing for a README with no pinned URL', async () => {
    const { tree, actions } = actionsFor('libs/errors', {
      'libs/errors/README.md': `[license](${LICENSE})\n`,
    });
    const logs = await actions.updateProjectVersion(tree, '0.4.0-rc.1');
    expect(tree.read('libs/errors/README.md', 'utf-8')).toBe(
      `[license](${LICENSE})\n`,
    );
    expect(logs.some((log) => log.startsWith('Pinned'))).toBe(false);
  });
});
