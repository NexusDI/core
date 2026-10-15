import {
  defineModule,
  isNexusError,
  Nexus,
  provide,
  Token,
} from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { MISSION } from '../src/ship/contracts';
import { Meridian, OfflineMeridian } from '../src/ship/meridian';
import { bridgePlugins } from '../src/ship/plugins';

describe('the bridge API graph', () => {
  it('compiles with no user code (the startup check of spec 9.2)', () => {
    expect(() =>
      Nexus.check(Meridian, { plugins: bridgePlugins() }),
    ).not.toThrow();
    expect(() =>
      Nexus.check(OfflineMeridian, { plugins: bridgePlugins() }),
    ).not.toThrow();
  });

  it('fails the check when a provider has no MISSION to read', () => {
    const TRACKER = new Token<{ id: string }>('Tracker');
    const Broken = defineModule({
      name: 'Broken',
      providers: [
        provide(TRACKER, {
          useFactory: (m) => m,
          deps: [MISSION],
          lifetime: 'scoped',
        }),
      ],
    });
    let thrown: unknown;
    try {
      Nexus.check(Broken);
    } catch (error) {
      thrown = error;
    }
    expect(isNexusError(thrown, 'NEXUS_BLUEPRINT_INVALID')).toBe(true);
  });
});
