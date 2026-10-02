// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { pageMetadata } from './page-metadata';

describe('pageMetadata', () => {
  it('keeps /next/ pages out of the index and lets crawlers follow links', () => {
    const metadata = pageMetadata(
      { title: 'Tokens' },
      ['tokens'],
      'next',
      '/next',
    );

    expect(metadata.title).toBe('Tokens');
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates).toEqual({
      canonical: 'https://nexus.js.org/next/tokens/',
    });
  });

  it('gives the landing page the bare base path as its canonical URL', () => {
    expect(pageMetadata({}, undefined, 'next', '/next').alternates).toEqual({
      canonical: 'https://nexus.js.org/next/',
    });
    expect(pageMetadata({}, [], 'release', '').alternates).toEqual({
      canonical: 'https://nexus.js.org/',
    });
  });

  it('indexes the root site', () => {
    expect(pageMetadata({}, ['tokens'], 'release', '').robots).toBeUndefined();
  });

  it('drops the console flag, which is a layout switch and no metadata field', () => {
    expect(
      pageMetadata({ console: true }, ['tokens'], 'next', '/next'),
    ).not.toHaveProperty('console');
  });
});
