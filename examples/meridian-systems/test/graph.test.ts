import { check, defineModule, Nexus, provide, Token } from '@nexusdi/core';
import { inspect } from '@nexusdi/devtools';
import { describe, expect, it } from 'vitest';

import { MeridianSystems } from '../src/meridian-systems.module';
import {
  DECK_PLAN,
  SHIP_FILES,
  SHIP_SYSTEMS,
} from '../src/simulation/contracts';
import { Simulation } from '../src/simulation/simulation.module';
import { HelmControl } from '../src/systems/helm/helm-control';
import { HelmPhysics } from '../src/systems/helm/helm-physics';
import { HELM, THRUSTERS } from '../src/systems/helm/contracts';
import { Helm } from '../src/systems/helm/helm.module';
import { RcsThrusters } from '../src/systems/helm/rcs-thrusters';
import {
  ATMOSPHERE_PROBE,
  type IAtmosphereProbe,
} from '../src/systems/life-support/contracts';
import {
  LifeSupport,
  ShipLifeSupport,
} from '../src/systems/life-support/life-support.module';
import { readCalibration } from '../src/systems/life-support/read-calibration';
import { Propulsion } from '../src/systems/propulsion/propulsion.module';
import { Safety } from '../src/systems/safety/safety.module';

import { SHIP_OPTIONS } from './support';

const Kernel = Simulation.forRoot(SHIP_OPTIONS);

describe('the module graph', () => {
  it('checks Simulation, MeridianSystems and Helm, and Helm imports Propulsion and Tactical', () => {
    const Root = defineModule({
      name: 'Root',
      imports: [Kernel, MeridianSystems, Helm],
    });
    expect(() => check(Root)).not.toThrow();
    const { modules } = inspect(Root);
    const names = new Map(modules.map(({ id, name }) => [id, name]));
    const helm = modules.find(({ name }) => name === 'Helm');
    expect(helm?.imports.map((id) => names.get(id))).toEqual([
      'Propulsion',
      'Tactical',
    ]);
    // Helm sits once in the graph, though MeridianSystems and the root both import it.
    expect(modules.filter(({ name }) => name === 'Helm')).toHaveLength(1);
  });

  it('refuses a Helm that leaves Tactical out with NEXUS_MISSING_PROVIDER', () => {
    const Blind = defineModule({
      name: 'BlindHelm',
      imports: [Propulsion],
      providers: [
        provide(THRUSTERS, { useClass: RcsThrusters }),
        provide(HELM, { useClass: HelmControl }),
      ],
    });
    expect(() =>
      check(defineModule({ name: 'Root', imports: [Kernel, Blind] })),
    ).toThrow(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            code: 'NEXUS_MISSING_PROVIDER',
            token: 'NavCharts',
            module: 'BlindHelm',
          }),
        ],
      }),
    );
  });

  it('refuses a system module that keeps its contribution private with NEXUS_UNREAD_CONTRIBUTION', () => {
    const Silent = defineModule({
      name: 'SilentHelm',
      imports: [Propulsion],
      providers: [
        provide(THRUSTERS, { useClass: RcsThrusters }),
        provide(SHIP_SYSTEMS, { useClass: HelmPhysics }),
      ],
    });
    expect(() =>
      check(defineModule({ name: 'Root', imports: [Kernel, Silent] })),
    ).toThrow(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            code: 'NEXUS_UNREAD_CONTRIBUTION',
            token: 'ShipSystems',
            module: 'SilentHelm',
          }),
        ],
      }),
    );
  });

  it('holds one ATMOSPHERE_PROBE for ShipLifeSupport imported along two paths', async () => {
    const Root = defineModule({
      name: 'Root',
      imports: [Kernel, Safety, ShipLifeSupport],
    });
    await using ship = await Nexus.create(Root);
    expect(ship.get(ATMOSPHERE_PROBE)).toBeDefined();
    expect(
      inspect(Root).modules.filter(({ name }) => name === 'LifeSupport'),
    ).toHaveLength(1);
  });

  it('reports NEXUS_AMBIGUOUS_PROVIDER for a module that sees two forRootAsync results', () => {
    const second = LifeSupport.forRootAsync({
      deps: [SHIP_FILES, DECK_PLAN],
      useFactory: readCalibration,
    });
    const READER = new Token<IAtmosphereProbe>('ProbeReader');
    const Reader = defineModule({
      name: 'ProbeReader',
      imports: [ShipLifeSupport, second],
      providers: [
        provide(READER, {
          useFactory: (probe: IAtmosphereProbe) => probe,
          deps: [ATMOSPHERE_PROBE],
        }),
      ],
    });
    expect(() =>
      check(defineModule({ name: 'Root', imports: [Kernel, Reader] })),
    ).toThrow(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            code: 'NEXUS_AMBIGUOUS_PROVIDER',
            token: 'AtmosphereProbe',
          }),
        ]),
      }),
    );
  });
});
