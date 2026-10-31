// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { bandRow, cleanUrl, flatten, group } from './search-model';

const data = {
  url: '/tokens.html',
  meta: { title: 'Tokens and interfaces' },
  filters: { band: ['Concepts'] },
  sub_results: [
    { title: 'Tokens', url: '/tokens.html', excerpt: 'a <mark>token</mark>' },
    { title: 'Identity', url: '/tokens.html#identity', excerpt: 'x' },
  ],
};

describe('search model', () => {
  it('drops .html from a result address, hash or not', () => {
    expect(cleanUrl('/tokens.html')).toBe('/tokens');
    expect(cleanUrl('/tokens.html#identity')).toBe('/tokens#identity');
    expect(cleanUrl('/tokens/')).toBe('/tokens/');
  });

  it('keeps a page title, its band and its hits', () => {
    const shaped = group(data);
    expect(shaped.title).toBe('Tokens and interfaces');
    expect(shaped.band).toBe('Concepts');
    expect(flatten([shaped]).map((hit) => hit.url)).toEqual([
      '/tokens',
      '/tokens#identity',
    ]);
  });

  it('shows no band row for ten pages or fewer', () => {
    const results = Array.from({ length: 10 }, () => ({
      data: async () => data,
    }));
    expect(
      bandRow({ results, filters: { band: { Concepts: 10 } } }, ['Concepts']),
    ).toEqual([]);
  });

  it('shows the bands in sidebar order above ten pages', () => {
    const results = Array.from({ length: 11 }, () => ({
      data: async () => data,
    }));
    expect(
      bandRow({ results, filters: { band: { API: 3, Concepts: 8 } } }, [
        'Start',
        'Concepts',
        'Guides',
        'API',
      ]),
    ).toEqual([
      { band: 'Concepts', count: 8 },
      { band: 'API', count: 3 },
    ]);
  });
});
