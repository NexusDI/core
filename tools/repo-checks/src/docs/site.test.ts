import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FIXTURES } from './paths';
import {
  compareVersions,
  isPreFinalPost,
  proseLines,
  readMeta,
  readMetaKeys,
  readSite,
  slugify,
  stripFences,
} from './site';

const CONTENT = join(FIXTURES, 'site', 'content');

describe('readSite', () => {
  const pages = readSite(CONTENT);
  const tokens = pages.find((page) => page.slug === 'tokens');

  it('reads every page under the content directory, blog folder included', () => {
    expect(pages.map((page) => page.slug).sort()).toEqual([
      'blog/first-release',
      'index',
      'tokens',
    ]);
  });

  it('parses the frontmatter and the kind', () => {
    expect(tokens?.kind).toBe('concept');
    expect(tokens?.frontmatter.console).toBe(true);
  });

  it('records headings with their depth, slug and source line', () => {
    expect(
      tokens?.headings.map(({ depth, slug, line }) => [depth, slug, line]),
    ).toEqual([
      [1, 'tokens', 8],
      [2, 'a-class-is-its-own-token', 12],
      [2, 'two-tokens-with-one-description-stay-distinct', 19],
    ]);
  });

  it('splits the page into H2 sections that own their fences', () => {
    expect(tokens?.sections.map((section) => section.fences.length)).toEqual([
      1, 2,
    ]);
    expect(tokens?.sections[0]?.body).toContain('<Notice kind="note">');
  });

  it('reads the language, the meta, the exemption tags and the section of a fence', () => {
    expect(
      tokens?.fences.map(({ lang, meta, tags, section, line }) => ({
        lang,
        meta,
        tags,
        section,
        line,
      })),
    ).toEqual([
      {
        lang: 'ts',
        meta: 'file=libs/core/README.md region=class-token',
        tags: [],
        section: 'A class is its own token',
        line: 16,
      },
      {
        lang: 'ts',
        meta: 'no-run',
        tags: ['no-run'],
        section: 'Two tokens with one description stay distinct',
        line: 21,
      },
      {
        lang: 'sh',
        meta: '',
        tags: [],
        section: 'Two tokens with one description stay distinct',
        line: 25,
      },
    ]);
  });

  it('applies a transform to the source before it parses', () => {
    const expanded = readSite(CONTENT, {
      transform: (source) =>
        source.replace(
          'region=class-token\n```',
          'region=class-token\nclass ShipComputer {}\n```',
        ),
    });
    const fence = expanded.find((page) => page.slug === 'tokens')?.fences[0];
    expect(fence?.body).toBe('class ShipComputer {}');
  });
});

describe('proseLines', () => {
  it('keeps prose and headings and drops fences, tags and code spans', () => {
    const tokens = readSite(CONTENT).find((page) => page.slug === 'tokens');
    const text = proseLines(tokens!)
      .map((line) => line.text)
      .join('\n');

    expect(text).toContain('A token names what a provider supplies.');
    expect(text).toContain('A class token needs no description.');
    expect(text).not.toContain('<Notice');
    expect(text).not.toContain('new Token');
    expect(text).not.toContain('`Token`');
  });

  it('reports the source line of each prose line', () => {
    const tokens = readSite(CONTENT).find((page) => page.slug === 'tokens');
    const first = proseLines(tokens!).find((line) =>
      line.text.startsWith('A token'),
    );
    expect(first?.line).toBe(10);
  });
});

describe('readMeta', () => {
  it('lists every key in order and marks separators and links as not pages', async () => {
    const meta = await readMeta(CONTENT);
    expect(meta.map(({ key, page }) => [key, page])).toEqual([
      ['index', true],
      ['-- Concepts', false],
      ['tokens', true],
      ['playground', false],
      ['blog', true],
      ['blog/first-release', true],
    ]);
  });

  it('returns the page keys alone from readMetaKeys', async () => {
    expect(await readMetaKeys(CONTENT)).toEqual([
      'index',
      'tokens',
      'blog',
      'blog/first-release',
    ]);
  });
});

describe('helpers', () => {
  it('slugifies a heading the way the theme anchors it', () => {
    expect(slugify('Configure `Comms` with `with()`')).toBe(
      'configure-comms-with-with',
    );
  });

  it('removes fenced blocks from a text', () => {
    expect(stripFences('a\n```ts\nx\n```\nb')).toBe('a\nb');
  });

  it('orders a prerelease below its release', () => {
    expect(compareVersions('0.4.0-rc.0', '0.4.0')).toBeLessThan(0);
    expect(compareVersions('0.3.1', '0.4.0')).toBeLessThan(0);
    expect(compareVersions('0.4.0', '0.4.0')).toBe(0);
    expect(compareVersions('0.4.1', '0.4.0')).toBeGreaterThan(0);
  });

  it('treats a post whose version is below 0.4.0 as pre-final', () => {
    const post = readSite(CONTENT).find(
      (page) => page.slug === 'blog/first-release',
    );
    const concept = readSite(CONTENT).find((page) => page.slug === 'tokens');
    expect(isPreFinalPost(post!)).toBe(true);
    expect(isPreFinalPost(concept!)).toBe(false);
  });
});
