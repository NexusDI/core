import { describe, expect, it } from 'vitest';

import * as federation from './index.js';

describe('@nexusdi/federation', () => {
  it('exports exactly defineContract, federation and ContractVersionError', () => {
    expect(Object.keys(federation).sort()).toEqual(
      ['ContractVersionError', 'defineContract', 'federation'].sort(),
    );
  });
});
