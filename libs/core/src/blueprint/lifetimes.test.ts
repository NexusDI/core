import { describe, expect, it } from 'vitest';

import { compileErrors } from '../../test-support/compile.js';
import { defineModule } from '../definitions/define-module.js';
import { lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { Token } from '../definitions/token.js';
import { compile } from './compile.js';

const MISSION = new Token<string>('Mission');
const scopedMission = provide(MISSION, {
  useFactory: () => 'survey',
  deps: [],
  lifetime: 'scoped',
});

class ShipComputer {
  constructor(readonly input: any) {}
}
class Drone {
  constructor(readonly input: any) {}
}

describe('compile', () => {
  it('reports NEXUS_LIFETIME_VIOLATION for a singleton that depends on a scoped provider', () => {
    const Root = defineModule({
      name: 'Root',
      providers: [scopedMission, provide(ShipComputer, { deps: [MISSION] })],
    });
    expect(compileErrors(Root)).toMatchObject([
      {
        code: 'NEXUS_LIFETIME_VIOLATION',
        path: ['ShipComputer', 'Mission'],
        lifetimes: ['singleton', 'scoped'],
      },
    ]);
  });

  it('follows transients and aliases from the singleton to the scoped provider', () => {
    const ALIAS = new Token<string>('MissionAlias');
    const Root = defineModule({
      name: 'Root',
      providers: [
        scopedMission,
        provide(ALIAS, { useExisting: MISSION }),
        provide(Drone, { deps: [ALIAS], lifetime: 'transient' }),
        provide(ShipComputer, { deps: [Drone] }),
      ],
    });
    expect(compileErrors(Root)).toMatchObject([
      {
        code: 'NEXUS_LIFETIME_VIOLATION',
        path: ['ShipComputer', 'Drone', 'MissionAlias', 'Mission'],
        lifetimes: ['singleton', 'transient', null, 'scoped'],
      },
    ]);
  });

  it('follows lazy edges too', () => {
    const Root = defineModule({
      name: 'Root',
      providers: [
        scopedMission,
        provide(ShipComputer, { deps: [lazy(MISSION)] }),
      ],
    });
    expect(compileErrors(Root)).toMatchObject([
      { code: 'NEXUS_LIFETIME_VIOLATION' },
    ]);
  });

  it('reports a singleton that depends on REQUEST', () => {
    const Root = defineModule({
      name: 'Root',
      providers: [provide(ShipComputer, { deps: [REQUEST] })],
    });
    expect(compileErrors(Root)).toMatchObject([
      { code: 'NEXUS_LIFETIME_VIOLATION', path: ['ShipComputer', 'REQUEST'] },
    ]);
  });

  it('accepts a singleton that depends on a transient whose closure reaches no scoped provider', () => {
    class Probe {}
    const Root = defineModule({
      name: 'Root',
      providers: [
        provide(Probe, { lifetime: 'transient' }),
        provide(ShipComputer, { deps: [Probe] }),
      ],
    });
    expect(() => compile({ root: Root })).not.toThrow();
  });

  it('accepts scoped and transient providers that depend on scoped ones', () => {
    const Root = defineModule({
      name: 'Root',
      providers: [
        scopedMission,
        provide(ShipComputer, { deps: [MISSION], lifetime: 'scoped' }),
        provide(Drone, { deps: [MISSION], lifetime: 'transient' }),
      ],
    });
    expect(() => compile({ root: Root })).not.toThrow();
  });
});
