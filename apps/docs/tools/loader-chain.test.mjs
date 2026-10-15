// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { mdxLoaderChain } from './loader-chain.mjs';
import { referenceOptions } from './reference-options.mjs';

const fence = '```';
const ROOT = '/workspace';

/** The chain's entry for a loader, found by the end of its path. */
const entryOf = (name, root = ROOT) =>
  mdxLoaderChain(root).find((entry) => entry.loader.endsWith(name));

/** Runs the chain the way Turbopack does: from the last entry to the first. */
async function run(source, root = ROOT) {
  let out = source;
  for (const entry of [...mdxLoaderChain(root)].reverse()) {
    const specifier = isAbsolute(entry.loader)
      ? pathToFileURL(entry.loader).href
      : entry.loader;
    const { default: loader } = await import(specifier);
    out = loader.call(
      {
        getOptions: () => entry.options ?? {},
        addDependency() {},
        resourcePath: 'fixture.mdx',
      },
      out,
    );
  }
  return out;
}

describe('the MDX loader chain', () => {
  it('lists the prelude, then the reference and region loaders, so the prelude executes last', () => {
    const names = mdxLoaderChain(ROOT).map((entry) =>
      entry.loader.split('/').at(-1),
    );
    expect(names).toEqual([
      'mdx-twoslash-prelude.mjs',
      'mdx-reference-loader',
      'mdx-region-loader',
      'mdx-diagram-loader.mjs',
      'mdx-listing-loader.mjs',
    ]);
    expect(entryOf('mdx-region-loader').options).toEqual({ root: ROOT });
  });

  it('gives the reference loader the prefixes of the shared options module', () => {
    expect(entryOf('mdx-reference-loader').options).toEqual({
      root: ROOT,
      ...referenceOptions,
    });
    expect(referenceOptions).toEqual({
      classPrefix: 'nexus',
      kindPrefix: 'meridian',
    });
  });

  it('runs the prelude over a twoslash fence the region loader filled', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loader-chain-'));
    mkdirSync(join(root, 'libs/x'), { recursive: true });
    writeFileSync(
      join(root, 'libs/x/README.md'),
      [
        '<!-- #region r -->',
        `${fence}ts @import.meta.vitest`,
        'const frequency = 1420;',
        fence,
        '<!-- #endregion r -->',
        '',
      ].join('\n'),
    );
    const page = [
      '# Tokens',
      '',
      `${fence}ts twoslash file=libs/x/README.md region=r`,
      fence,
      '',
    ].join('\n');

    const out = await run(page, root);
    rmSync(root, { recursive: true, force: true });

    const filled = out.slice(out.indexOf(`${fence}ts twoslash`));
    expect(filled).toContain('// @lib: es2023,esnext.disposable');
    expect(filled.indexOf('// @lib:')).toBeLessThan(
      filled.indexOf('const frequency = 1420;'),
    );
  });

  it('fills a region fence, wraps a tagged fence and rewrites a diagram', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loader-chain-'));
    mkdirSync(join(root, 'examples/meridian/src/pages'), { recursive: true });
    writeFileSync(
      join(root, 'examples/meridian/src/pages/tokens.md'),
      [
        '<!-- #region first-ship -->',
        `${fence}ts @import.meta.vitest`,
        'const frequency = 1420;',
        fence,
        '<!-- #endregion first-ship -->',
        '',
      ].join('\n'),
    );
    const page = [
      '# Tokens',
      '',
      `${fence}ts file=examples/meridian/src/pages/tokens.md region=first-ship`,
      fence,
      '',
      `${fence}mermaid caption="Tactical imports Engineering."`,
      'flowchart TD',
      '  Tactical --> Engineering',
      fence,
      '',
      `${fence}ts no-run`,
      'ship.get(NAV_CHARTS);',
      fence,
      '',
    ].join('\n');

    const out = await run(page, root);
    rmSync(root, { recursive: true, force: true });

    expect(out).toContain(`${fence}ts\nconst frequency = 1420;\n${fence}`);
    expect(out).toContain('<Diagram chart=');
    expect(out).toContain('<Listing mark="no-run">');
  });
});
