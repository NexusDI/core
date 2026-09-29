import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { cliVersion } from './version.js';

describe('cliVersion', () => {
  it('reads the version from the package manifest', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(cliVersion()).toBe(manifest.version);
  });
});
