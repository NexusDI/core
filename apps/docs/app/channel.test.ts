import { describe, expect, it } from 'vitest';

import { readBasePath, readChannel } from './channel';

describe('readChannel', () => {
  it('defaults to next', () => {
    expect(readChannel({})).toBe('next');
  });

  it('reads release', () => {
    expect(readChannel({ DOCS_CHANNEL: 'release' })).toBe('release');
  });

  it('rejects any other value', () => {
    expect(() => readChannel({ DOCS_CHANNEL: 'beta' })).toThrow(
      "DOCS_CHANNEL is 'beta'. Set it to 'next' or 'release'.",
    );
  });
});

describe('readBasePath', () => {
  it('is empty when unset', () => {
    expect(readBasePath({})).toBe('');
  });

  it('reads /next', () => {
    expect(readBasePath({ DOCS_BASE_PATH: '/next' })).toBe('/next');
  });

  it('rejects a path without a leading slash', () => {
    expect(() => readBasePath({ DOCS_BASE_PATH: 'next' })).toThrow(
      "DOCS_BASE_PATH is 'next'. It must be empty or start with '/' and not end with '/'.",
    );
  });

  it('rejects a trailing slash', () => {
    expect(() => readBasePath({ DOCS_BASE_PATH: '/next/' })).toThrow(
      "DOCS_BASE_PATH is '/next/'.",
    );
  });
});
