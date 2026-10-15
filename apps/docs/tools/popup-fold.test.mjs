// @vitest-environment node
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import loader, { tableFor } from './mdx-nextra-loader.mjs';
import { panelHtml } from './popup-fold.mjs';

const docsRoot = join(import.meta.dirname, '..');
const require = createRequire(join(docsRoot, 'package.json'));

/**
 * Ported from `Evanion/libraries` `apps/docs/tools/popup-panels.test.mjs` at
 * 670ac27f.
 *
 * One MDX source compiled the way `next build` compiles a page: through
 * `mdx-nextra-loader.mjs` into Nextra's own loader, with the options Nextra
 * registers, Twoslash and all.
 */
function compile(source) {
  return new Promise((resolve, reject) => {
    loader.call(
      {
        getOptions: () => ({
          nextraLoader: join(
            dirname(require.resolve('nextra/package.json')),
            'loader.cjs',
          ),
          mdxOptions: { rehypePrettyCodeOptions: {} },
          search: { codeblocks: false },
          defaultShowCopyCode: true,
          latex: true,
          staticImage: true,
          contentDirBasePath: '/',
          whiteListTagsStyling: [],
        }),
        async: () => (error, value) => (error ? reject(error) : resolve(value)),
        resourcePath: join(docsRoot, 'content', 'popup-fold-test.mdx'),
        resourceQuery: '',
        // Turbopack's file watching, which a single compile has no use for.
        addContextDependency: () => undefined,
        addDependency: () => undefined,
      },
      source,
    );
  });
}

const FENCE = [
  '```ts twoslash',
  '/**',
  ' * Read [the guide](javascript:alert(1)) or [the site](https://example.com).',
  ' */',
  'function guide(): void {}',
  'guide();',
  '```',
].join('\n');

/** The table the compile writes for the test page. */
const TABLE = join(docsRoot, 'public', 'popups', 'popup-fold-test.json');

afterEach(() => rmSync(TABLE, { force: true }));

describe('the popup fold', { timeout: 120_000 }, () => {
  /**
   * The shape the site depends on, from Nextra's real loader: every hover is
   * a plain span around a button carrying its panel's key, no panel tree is
   * left in the page, and the page's table holds the panel. A Nextra upgrade
   * that renames the popup's tags, or runs the site's transformers before its
   * own Twoslash transformer, leaves the trees in place and fails here.
   */
  it("folds every hover in Nextra's output into the page's table", async () => {
    const out = await compile(FENCE);
    const keys = [...out.matchAll(/data-pop="([a-z0-9]+)"/g)].map(
      ([, key]) => key,
    );

    expect(keys.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/Popup\.(Panel|Button)|twoslash-popup-container/);
    expect(existsSync(TABLE)).toBe(true);
    const table = JSON.parse(readFileSync(TABLE, 'utf8'));
    for (const key of keys) expect(table[key]).toContain('twoslash-popup-code');
  });

  it('keeps a docblock link as its text, through the real loader', async () => {
    await compile(FENCE);
    const panels = Object.values(JSON.parse(readFileSync(TABLE, 'utf8'))).join(
      '',
    );

    expect(panels).toContain('the guide');
    expect(panels).toContain('the site');
    expect(panels, 'A type card carries no link.').not.toMatch(/<a\b|href=/);
    expect(panels).not.toMatch(/javascript:/i);
  });

  it('gives a fence one tab stop, on its first token', async () => {
    const out = await compile(FENCE);
    const stops = [
      ...out.matchAll(/data-pop="[a-z0-9]+" tabIndex="(-?\d+)"/g),
    ].map(([, at]) => at);

    expect(stops[0]).toBe('0');
    expect(stops.slice(1).every((each) => each === '-1')).toBe(true);
  });

  it('gives a code block in a popup the lines rehype-pretty-code gives every other block', () => {
    const line = (children) => ({
      type: 'element',
      tagName: 'span',
      properties: { className: ['line'] },
      children,
    });
    const html = panelHtml([
      {
        type: 'element',
        tagName: 'pre',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'code',
            properties: {},
            children: [line([{ type: 'text', value: 'a' }]), line([])],
          },
        ],
      },
    ]);

    expect(html).toBe('<pre><code><span>a</span><span> </span></code></pre>');
  });

  it('drops a javascript: href, a script and an event handler, and keeps the token classes', () => {
    const html = panelHtml([
      {
        type: 'element',
        tagName: 'code',
        properties: { class: 'twoslash-popup-code' },
        children: [
          {
            type: 'element',
            tagName: 'span',
            properties: { class: 'sh-1itgoe' },
            children: [{ type: 'text', value: 'function' }],
          },
        ],
      },
      {
        type: 'element',
        tagName: 'a',
        properties: { href: 'javascript:alert(1)', onClick: 'alert(2)' },
        children: [{ type: 'text', value: 'bad' }],
      },
      {
        type: 'element',
        tagName: 'script',
        properties: {},
        children: [{ type: 'text', value: 'alert(3)' }],
      },
    ]);

    expect(html).toContain(
      '<code class="twoslash-popup-code"><span class="sh-1itgoe">function</span></code>',
    );
    expect(html).not.toMatch(/javascript:|onclick|<script|alert\(3\)/i);
  });

  it('keeps only shiki theme variables in an inline style', () => {
    const span = (style) => ({
      type: 'element',
      tagName: 'span',
      properties: { style },
      children: [{ type: 'text', value: 'x' }],
    });
    const html = panelHtml([
      span('--shiki-light:#24292E;--shiki-dark:#E1E4E8'),
      span('position:fixed;inset:0'),
      span('--shiki-dark:url(https://example.com/x.png)'),
    ]);

    expect(html).toBe(
      '<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">x</span><span>x</span><span>x</span>',
    );
  });

  it('mounts the type cards on a page with a twoslash fence and on no other', async () => {
    expect(await compile(FENCE)).toContain('TypeCards');
    expect(
      await compile('# A guide\n\n```ts\nconst a = 1;\n```'),
    ).not.toContain('TypeCards');
  });

  it("names a page's table after its route, as the popover reads it", () => {
    const at = (path) =>
      tableFor(join(docsRoot, 'content', path))?.slice(
        join(docsRoot, 'public', 'popups').length + 1,
      );

    expect(at('index.mdx')).toBe('index.json');
    expect(at('api-node.mdx')).toBe('api-node.json');
    expect(at('errors/index.mdx')).toBe('errors.json');
    expect(at('errors/NEXUS_DISPOSED.mdx')).toBe('errors/NEXUS_DISPOSED.json');
    expect(tableFor(join(docsRoot, 'tools', 'x.mdx'))).toBeNull();
  });

  it('keeps only the classes Shiki and Twoslash write, and a token data-pop', () => {
    const html = panelHtml([
      {
        type: 'element',
        tagName: 'pre',
        properties: {
          className: ['shiki', 'github-dark', 'twoslash-popup-code'],
        },
        children: [
          {
            type: 'element',
            tagName: 'span',
            properties: { className: ['sh-1itgoe', 'evil'], dataPop: '3' },
            children: [{ type: 'text', value: 'x' }],
          },
          {
            type: 'element',
            tagName: 'img',
            properties: { src: 'https://example.com/x.png' },
            children: [],
          },
        ],
      },
    ]);

    expect(html).toBe(
      '<pre class="twoslash-popup-code"><span class="sh-1itgoe" data-pop="3">x</span></pre>',
    );
  });
});
