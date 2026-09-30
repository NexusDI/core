import { describe, expect, it } from 'vitest';

import { newestTag } from './release-core.ts';

describe('newestTag', () => {
  it('ignores releases before the 0.4 API', () => {
    expect(newestTag(['@nexusdi/core@0.3.2', '@nexusdi/core@0.2.0'])).toBe(
      null,
    );
  });
  it('picks the newest release at or above 0.4.0', () => {
    expect(
      newestTag([
        '@nexusdi/core@0.3.2',
        '@nexusdi/core@0.4.0-rc.1',
        '@nexusdi/core@0.4.0',
        '@nexusdi/core@0.4.1',
        '@nexusdi/devtools@0.9.0',
      ]),
    ).toBe('@nexusdi/core@0.4.1');
  });
});
