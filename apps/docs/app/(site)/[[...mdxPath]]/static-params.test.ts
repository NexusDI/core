import { describe, expect, it } from 'vitest';

import { keepRoute } from './static-params';

describe('keepRoute', () => {
  it('keeps the root page on both channels', () => {
    expect(keepRoute(undefined, 'next')).toBe(true);
    expect(keepRoute([], 'release')).toBe(true);
  });

  it('keeps a content page on both channels', () => {
    expect(keepRoute(['tokens'], 'next')).toBe(true);
    expect(keepRoute(['tokens'], 'release')).toBe(true);
  });

  it('drops the blog and its posts on the next channel', () => {
    expect(keepRoute(['blog'], 'next')).toBe(false);
    expect(keepRoute(['blog', 'first-release'], 'next')).toBe(false);
  });

  it('keeps the blog on the release channel', () => {
    expect(keepRoute(['blog', 'first-release'], 'release')).toBe(true);
  });

  it('keeps a page whose name only starts with blog', () => {
    expect(keepRoute(['blogging'], 'next')).toBe(true);
  });
});
