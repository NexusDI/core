import { describe, expect, it } from 'vitest';

import { shellOrigins } from '../../src/env/cors';

describe('shellOrigins', () => {
  it("allows the shell's dev server on both loopback names when SHELL_ORIGIN is unset or empty", () => {
    const both = ['http://localhost:4300', 'http://127.0.0.1:4300'];
    expect(shellOrigins({})).toEqual(both);
    expect(shellOrigins({ SHELL_ORIGIN: '' })).toEqual(both);
  });

  it('trims each entry and drops the empty ones', () => {
    expect(
      shellOrigins({ SHELL_ORIGIN: 'http://a.test, http://b.test ,, ' }),
    ).toEqual(['http://a.test', 'http://b.test']);
  });

  it('reads a comma-separated SHELL_ORIGIN', () => {
    expect(
      shellOrigins({
        SHELL_ORIGIN: 'http://127.0.0.1:4330,http://localhost:4330',
      }),
    ).toEqual(['http://127.0.0.1:4330', 'http://localhost:4330']);
  });

  it('allows no origin in production, whatever SHELL_ORIGIN holds', () => {
    expect(
      shellOrigins({
        NODE_ENV: 'production',
        SHELL_ORIGIN: 'http://127.0.0.1:4330',
      }),
    ).toEqual([]);
  });
});
