import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readAllowance } from './docs/allowance';
import {
  checkLinks,
  emittedLinks,
  linksOf,
  missionIds,
} from './docs/doc-links';
import { loadNavigation } from './docs/doc-navigation';
import { CONTENT, DOCS, FIXTURES } from './docs/paths';
import { readMeta, readSite, type DocsPage } from './docs/site';

const TOOLS = ['/playground/', '/academy/', '/academy/progress/'];
const ALLOWANCE = join(import.meta.dirname, 'doc-links-allowance.json');
const root = (name: string) => join(FIXTURES, 'doc-links', name);
const tree = (name: string) => readSite(join(root(name), 'content'));
const at =
  'tools/repo-checks/src/__fixtures__/docs/doc-links/sabotaged/content/index.mdx';
const component =
  'tools/repo-checks/src/__fixtures__/docs/doc-links/sabotaged/components/Notice.tsx';

describe('doc-links fixtures', () => {
  it('passes a clean tree', () => {
    expect(
      checkLinks({
        pages: tree('clean'),
        toolRoutes: TOOLS,
        missions: ['01-first-light'],
        pending: {},
      }),
    ).toEqual([]);
  });

  it('passes a link to a pending route, and fails a pending route that exists or has no reason', () => {
    expect(
      checkLinks({
        pages: tree('sabotaged'),
        toolRoutes: TOOLS,
        missions: ['01-first-light'],
        pending: {
          '/nowhere/': 'Phase 1 writes it.',
          '/missing/': '',
          '/': 'Phase 1 writes it.',
        },
      }).filter((finding) => finding.startsWith('doc-links-allowance.json')),
    ).toEqual([
      "doc-links-allowance.json: '/' exists now. Remove the entry.",
      "doc-links-allowance.json: '/missing/' records no reason. Say what the route waits for.",
    ]);
  });

  it('fails a hard-coded base path, an unknown page, an unknown mission, a README link and an unknown JSX href', () => {
    expect(
      checkLinks({
        pages: tree('sabotaged'),
        toolRoutes: TOOLS,
        missions: ['01-first-light'],
        pending: {},
      }),
    ).toEqual([
      `${at}: '/academy/99-ghost/' names no mission. The missions are 01-first-light.`,
      `${at}: '/missing/' names no content page or tool route.`,
      `${at}: '/next/tokens/' hard-codes the /next base path. Write '/tokens/'; Next adds the base path, and the link keeps working after the swap at 0.4.0 final.`,
      `${at}: '/nowhere/' names no content page or tool route.`,
      `${at}: 'https://github.com/NexusDI/core/blob/main/libs/core/README.md' links to a NexusDI README on GitHub. Link to the page on this site that documents the same thing.`,
    ]);
  });

  it('holds a link that a component or _meta.ts emits to the same rules', () => {
    const emitted = [
      ...emittedLinks([join(root('sabotaged'), 'components')]),
      { file: 'apps/docs/content/_meta.ts', links: ['/gone/'] },
    ];
    expect(
      checkLinks({
        pages: tree('clean'),
        toolRoutes: TOOLS,
        missions: ['01-first-light'],
        pending: { '/gone/': 'Phase 1 writes it.' },
        emitted,
      }),
    ).toEqual([
      `${component}: '/next/release-candidate/' hard-codes the /next base path. Write '/release-candidate/'; Next adds the base path, and the link keeps working after the swap at 0.4.0 final.`,
    ]);
  });

  it('lists the links of a page, fences excluded', () => {
    const [index] = tree('sabotaged');
    expect(linksOf(index as DocsPage)).toEqual([
      '/next/tokens/',
      '/nowhere/',
      '/academy/99-ghost/',
      'https://github.com/NexusDI/core/blob/main/libs/core/README.md',
      '/missing/',
    ]);
  });

  it('reads the href of a _meta.ts entry as emitted', () => {
    expect(
      emittedLinks(
        [],
        [
          { key: 'docs', page: false, value: { href: '/getting-started/' } },
          { key: 'index', page: true, value: { title: 'NexusDI' } },
        ],
      ),
    ).toEqual([
      { file: 'apps/docs/content/_meta.ts', links: ['/getting-started/'] },
    ]);
  });

  it('finds no mission when the academy folder does not exist', () => {
    expect(missionIds(join(FIXTURES, 'no-such-academy'))).toEqual([]);
  });
});

describe('doc-links on apps/docs', () => {
  it('holds', async () => {
    const { toolRoutes } = await loadNavigation();
    const meta = await readMeta(CONTENT);
    expect(
      checkLinks({
        pages: readSite(CONTENT),
        toolRoutes,
        missions: missionIds(join(DOCS, 'academy')),
        pending: readAllowance<Record<string, string>>(ALLOWANCE),
        emitted: emittedLinks(
          [join(DOCS, 'components'), join(DOCS, 'app')],
          meta,
        ),
      }),
    ).toEqual([]);
  });

  it('covers the release notice link', () => {
    const notice = emittedLinks([join(DOCS, 'components')]).find((source) =>
      source.file.endsWith('ReleaseNotice.tsx'),
    );
    expect(notice?.links).toContain('/release-candidate/');
  });
});
