import { describe, expect, it } from 'vitest';

import { reportsPin } from '../scripts/runtime-version.mjs';

describe('reportsPin', () => {
  it("reads Deno's version line exactly", () => {
    const reported =
      'deno 2.9.6 (stable, release, aarch64-apple-darwin)\nv8 13.9\ntypescript 5.9.2\n';
    expect(reportsPin('deno', reported, '2.9.6')).toBe(true);
    expect(reportsPin('deno', reported, '2.9')).toBe(false);
    expect(reportsPin('deno', 'deno 2.9.60 (stable)\n', '2.9.6')).toBe(false);
    expect(reportsPin('deno', 'v8 2.9.6\n', '2.9.6')).toBe(false);
  });

  it("reads Bun's version whole", () => {
    expect(reportsPin('bun', '1.4.2\n', '1.4.2')).toBe(true);
    expect(reportsPin('bun', '1.4.21\n', '1.4.2')).toBe(false);
    expect(reportsPin('bun', '1.4\n', '1.4.2')).toBe(false);
  });
});
