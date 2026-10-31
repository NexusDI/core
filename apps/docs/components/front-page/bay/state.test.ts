import { SEED } from '@nexusdi/meridian/scenes/front-page';
import { describe, expect, it } from 'vitest';

import { partById } from './geometry';
import { SEED_STATE, isIntact, isSeed, withPart } from './state';

describe('the bay state', () => {
  it('equals the scene seed', () => {
    expect(SEED_STATE).toEqual(SEED);
    expect(isSeed(SEED_STATE)).toBe(true);
  });

  it('flips one part and leaves the seed alone', () => {
    const part = partById('conduit-Tactical-Comms');
    if (!part) throw new Error('no part');
    const cut = withPart(SEED_STATE, part, false);
    expect(isIntact(cut, part)).toBe(false);
    expect(isIntact(SEED_STATE, part)).toBe(true);
    expect(isSeed(cut)).toBe(false);
    expect(withPart(cut, part, true)).toEqual(SEED_STATE);
  });

  it('flips the chart server switch', () => {
    const part = partById('chart-server');
    if (!part) throw new Error('no part');
    expect(withPart(SEED_STATE, part, false).chartServerReachable).toBe(false);
  });
});
