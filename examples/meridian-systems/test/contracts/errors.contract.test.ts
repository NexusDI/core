import { defineModule, Nexus, provide, Token } from '@nexusdi/core';
import { describe, expect, it, vi } from 'vitest';

import {
  SHIP_STATE,
  TICK_LOOP,
  type SimOptions,
} from '../../src/simulation/contracts';
import { Simulation } from '../../src/simulation/simulation.module';
import {
  ATMOSPHERE_PROBE,
  type IAtmosphereProbe,
} from '../../src/systems/life-support/contracts';
import {
  LifeSupport,
  ShipLifeSupport,
} from '../../src/systems/life-support/life-support.module';
import { readCalibration } from '../../src/systems/life-support/read-calibration';
import { DECK_PLAN, SHIP_FILES } from '../../src/simulation/contracts';
import { Engineering } from '../../src/systems/engineering/engineering.module';
import { POWER_ROUTER } from '../../src/systems/engineering/contracts';
import { FtlDrive } from '../../src/systems/ftl/ftl-drive.module';
import {
  FTL_COMMANDS,
  FTL_DRIVE,
  FTL_PHYSICS,
  FTL_POWER,
  type IFtlDrive,
} from '../../src/systems/ftl/contracts';
import { FtlPhysics } from '../../src/systems/ftl/ftl-physics';
import { FtlPower } from '../../src/systems/ftl/ftl-power';
import { JumpDrive } from '../../src/systems/ftl/jump-drive';
import { Tactical } from '../../src/systems/tactical/tactical.module';
import {
  type ICommandHandler,
  type QueuedCommand,
} from '../../src/simulation/commands';
import { MeridianSystems } from '../../src/meridian-systems.module';
import { TELEMETRY } from '../../src/telemetry/contracts';
import { shipRoot } from '../ship-root';
import { SHIP_OPTIONS } from '../support';

import { expectFixLine, expectTextWithoutFixLine, findCode } from './fix-line';

const rejection = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject.');
};

const thrown = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw.');
};

describe('the NEXUS errors a ship build reaches', () => {
  it('NEXUS_MISSING_PROVIDER names the token and the module and words a fix', () => {
    // FtlDrive alone lacks the kernel that Simulation gives a ship.
    const error = findCode(
      thrown(() => Nexus.check(FtlDrive)),
      'NEXUS_MISSING_PROVIDER',
    );
    expect(error).toMatchObject({ module: 'FtlDrive' });
    expectFixLine(error);
  });

  it('NEXUS_NOT_VISIBLE names a token a root does not import the module of', async () => {
    await using bare = await Nexus.create(shipRoot());
    const error = thrown(() => bare.get(TELEMETRY));
    expect(error).toMatchObject({
      code: 'NEXUS_NOT_VISIBLE',
      token: 'TelemetryFeed',
    });
    expectFixLine(findCode(error, 'NEXUS_NOT_VISIBLE'));
  });

  it('NEXUS_AMBIGUOUS_PROVIDER names the token two imports provide', () => {
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
    const error = findCode(
      thrown(() =>
        Nexus.check(
          defineModule({
            name: 'Root',
            imports: [Simulation.forRoot(SHIP_OPTIONS), Reader],
          }),
        ),
      ),
      'NEXUS_AMBIGUOUS_PROVIDER',
    );
    expect(error).toMatchObject({ token: 'AtmosphereProbe' });
    expectFixLine(error);
  });

  it('NEXUS_INVALID_MODULE_OPTIONS lists each refused field of the simulation options', async () => {
    const error = await rejection(
      Nexus.create(
        shipRoot({ sim: { seed: 7, dt: 'half' } as unknown as SimOptions }),
      ),
    );
    const invalid = findCode(error, 'NEXUS_INVALID_MODULE_OPTIONS');
    expect(invalid).toMatchObject({ module: 'Simulation' });
    expect(invalid.issues.map(({ path }) => path)).toEqual([['dt']]);
    expectTextWithoutFixLine(invalid);
  });

  it('NEXUS_MODULE_OPTIONS_MISSING names a configured module imported with no forRoot', async () => {
    const error = await rejection(
      Nexus.create(
        defineModule({
          name: 'Unconfigured',
          imports: [Simulation, MeridianSystems],
        }),
      ),
    );
    const missing = findCode(error, 'NEXUS_MODULE_OPTIONS_MISSING');
    expect(missing).toMatchObject({ module: 'Simulation' });
    expectFixLine(missing);
  });

  it('NEXUS_CIRCULAR_DEPENDENCY names the cycle an eager FTL command handler closes', () => {
    class EagerFtlCommands implements ICommandHandler {
      static deps = [FTL_DRIVE] as const;
      readonly system = 'ftl';
      constructor(private readonly drive: IFtlDrive) {}
      handle(): QueuedCommand {
        return this.drive.spool();
      }
    }
    const Eager = defineModule({
      name: 'EagerFtlDrive',
      imports: [Engineering, Tactical],
      providers: [
        provide(FTL_DRIVE, { useClass: JumpDrive }),
        provide(FTL_PHYSICS, { useClass: FtlPhysics }),
        provide(FTL_POWER, { useClass: FtlPower }),
        provide(FTL_COMMANDS, { useClass: EagerFtlCommands }),
      ],
      exports: [FTL_DRIVE],
    });
    const error = findCode(
      thrown(() =>
        Nexus.check(shipRoot({ reads: [Engineering] }), { load: [Eager] }),
      ),
      'NEXUS_CIRCULAR_DEPENDENCY',
    );
    expectFixLine(error);
  });

  it('NEXUS_LOADED_AFTER_SCOPE names the drive a scope opened before the load cannot read', async () => {
    await using ship = await Nexus.create(shipRoot({ reads: [Engineering] }));
    await using scope = await ship.createScope({ request: {} });
    await ship.load(FtlDrive);
    const error = thrown(() => scope.get(FTL_DRIVE));
    expect(error).toMatchObject({
      code: 'NEXUS_LOADED_AFTER_SCOPE',
      token: 'FtlDrive',
      module: 'FtlDrive',
    });
    expectFixLine(findCode(error, 'NEXUS_LOADED_AFTER_SCOPE'));
  });

  it('NEXUS_PROVIDER_FAILED carries the cause of a load whose provider threw', async () => {
    await using ship = await Nexus.create(shipRoot({ reads: [Engineering] }));
    vi.spyOn(ship.get(POWER_ROUTER), 'register').mockImplementationOnce(() => {
      throw new Error('The router is down.');
    });
    const error = await rejection(ship.load(FtlDrive));
    expect(error).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      cause: { message: 'The router is down.' },
    });
    expectTextWithoutFixLine(findCode(error, 'NEXUS_PROVIDER_FAILED'));
    // The ship still runs after the failed load.
    expect(ship.get(TICK_LOOP).advance(1).tick).toBe(1);
    expect(ship.get(SHIP_STATE)).toBeDefined();
  });
});
