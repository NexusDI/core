import { describe, expect, it } from 'vitest';

import * as federation from './index.js';
import * as text from './text.js';

describe('@nexusdi/federation', () => {
  it('exports exactly defineContract, federation and ContractVersionError', () => {
    expect(Object.keys(federation).sort()).toEqual(
      ['ContractVersionError', 'defineContract', 'federation'].sort(),
    );
  });
});

describe('@nexusdi/federation/text', () => {
  it('exports exactly federationText', () => {
    expect(Object.keys(text)).toEqual(['federationText']);
  });
});
