// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { bandOf } from './bands';
import { bands } from './navigation';

describe('bandOf', () => {
  it('names the band of the last separator above a page', () => {
    expect(bandOf('getting-started')).toBe('Start');
    expect(bandOf('scopes')).toBe('Concepts');
    expect(bandOf('hono')).toBe('Guides');
    expect(bandOf('upgrade')).toBe('Migration');
    expect(bandOf('api-errors')).toBe('API');
  });

  it('puts the code pages under the Errors concept page', () => {
    expect(bandOf('errors')).toBe('Concepts');
  });

  it('gives a navbar entry or an unknown page no band', () => {
    expect(bandOf('docs')).toBeUndefined();
    expect(bandOf('nothing')).toBeUndefined();
    expect(bandOf(undefined)).toBeUndefined();
  });

  it('only returns bands the site names', () => {
    for (const slug of ['index', 'tokens', 'plugins', 'upgrade', 'api'])
      expect(bands).toContain(bandOf(slug));
  });
});
