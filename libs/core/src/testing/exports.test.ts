import { describe, expect, it } from 'vitest';

import * as testing from './index.js';

describe('@nexusdi/core/testing', () => {
  it('exports exactly createTestingContainer', () => {
    expect(Object.keys(testing)).toEqual(['createTestingContainer']);
  });
});
