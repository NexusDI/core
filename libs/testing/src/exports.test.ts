import { describe, expect, it } from 'vitest';

import * as testing from './index.js';

describe('@nexusdi/testing', () => {
  it('exports exactly createTestingContainer and OverrideError', () => {
    expect(Object.keys(testing).sort()).toEqual(
      ['createTestingContainer', 'OverrideError'].sort(),
    );
  });
});
