import {
  defineModule,
  isNexusError,
  Nexus,
  provide,
  Token,
} from '@nexusdi/core';
import { devtools, graph } from '@nexusdi/devtools';
import { describe, expect, it } from 'vitest';

import drawn from '../graph.json';
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

  it('names the audit module AuditTrail, in the container and in graph.json', async () => {
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: [...bridgePlugins(), devtools()],
    });
    const names = graph(ship).modules.map((m) => m.name);
    expect(names).toContain('AuditTrail');
    expect(names).not.toContain('Audit');
    const drawnNames = drawn.modules.map((m) => m.name);
    expect(drawnNames).toContain('AuditTrail');
    expect(drawnNames).not.toContain('Audit');
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
