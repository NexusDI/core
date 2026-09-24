import { describe, expect, it } from 'vitest';

import { thrown } from '../../test-support/catch.js';
import {
  Inject,
  Injectable,
  Module,
  Nexus,
  Token,
  lazy,
  optional,
  provide,
} from '../index.js';

interface NavCharts {
  plot(): string;
}
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
const charts: NavCharts = { plot: () => 'sector-7' };

class ReactorCore {
  output = 1.21;
}

describe('Injectable', () => {
  it('gives a bare class the deps and lifetime it declares', async () => {
    @Injectable({ deps: [ReactorCore], lifetime: 'transient' })
    class SurveyDrone {
      constructor(readonly reactor: ReactorCore) {}
    }
    @Module({ providers: [ReactorCore, SurveyDrone] })
    class Bay {}
    const ship = await Nexus.create(Bay);
    expect(ship.get(SurveyDrone).reactor).toBe(ship.get(ReactorCore));
    expect(ship.get(SurveyDrone)).not.toBe(ship.get(SurveyDrone));
  });

  it('yields to explicit provide() options, with no merging', async () => {
    @Injectable({ deps: [ReactorCore], lifetime: 'transient' })
    class SurveyDrone {
      constructor(readonly reactor?: ReactorCore) {}
    }
    @Module({
      providers: [
        ReactorCore,
        provide(SurveyDrone, { deps: [optional(ReactorCore)] }),
      ],
    })
    class Bay {}
    const ship = await Nexus.create(Bay);
    expect(ship.get(SurveyDrone)).toBe(ship.get(SurveyDrone));
  });

  it('gives a useClass binding the deps @Injectable declares', async () => {
    interface IReactorCore {
      readonly output: number;
    }
    interface IShipComputer {
      readonly reactor: IReactorCore;
    }
    const REACTOR = new Token<IReactorCore>('ReactorCore');
    const COMPUTER = new Token<IShipComputer>('ShipComputer');
    class FusionReactor implements IReactorCore {
      readonly output = 1.21;
    }
    @Injectable({ deps: [REACTOR] })
    class ShipComputer implements IShipComputer {
      constructor(readonly reactor: IReactorCore) {}
    }
    @Module({
      providers: [
        provide(REACTOR, { useClass: FusionReactor }),
        provide(COMPUTER, { useClass: ShipComputer }),
      ],
    })
    class Engineering {}
    await using ship = await Nexus.create(Engineering);
    expect(ship.get(COMPUTER).reactor).toBe(ship.get(REACTOR));
  });

  it('lets a subclass without @Injectable inherit the parent deps', async () => {
    @Injectable({ deps: [ReactorCore] })
    class Computer {
      constructor(readonly reactor: ReactorCore) {}
    }
    class BackupComputer extends Computer {}
    @Module({ providers: [ReactorCore, BackupComputer] })
    class Engineering {}
    const ship = await Nexus.create(Engineering);
    expect(ship.get(BackupComputer).reactor).toBe(ship.get(ReactorCore));
  });

  it('throws NEXUS_LEGACY_DECORATORS when called the experimentalDecorators way', () => {
    const legacy = Injectable({ deps: [] }) as unknown as (
      target: unknown,
    ) => void;
    expect(thrown(() => legacy(class Drone {}))).toMatchObject({
      code: 'NEXUS_LEGACY_DECORATORS',
      decorator: 'Injectable',
    });
  });
});

describe('Inject', () => {
  it('sets properties after the constructor and before onInit', async () => {
    const seen: string[] = [];
    class Bridge {
      @Inject(NAV_CHARTS) accessor charts!: NavCharts;
      constructor() {
        seen.push(`constructor sees ${typeof this.charts}`);
      }
      onInit() {
        seen.push(`onInit sees ${this.charts.plot()}`);
      }
    }
    @Module({
      providers: [provide(NAV_CHARTS, { useValue: charts }), Bridge],
      exports: [Bridge],
    })
    class Command {}
    const ship = await Nexus.create(Command);
    expect(ship.get(Bridge).charts).toBe(charts);
    expect(seen).toEqual([
      'constructor sees undefined',
      'onInit sees sector-7',
    ]);
  });

  it('injects the parent properties and the subclass properties', async () => {
    const order: string[] = [];
    class Station {
      @Inject(NAV_CHARTS) accessor charts!: NavCharts;
    }
    class Outpost extends Station {
      @Inject(lazy(ReactorCore)) accessor reactor!: () => ReactorCore;
    }
    @Module({
      providers: [
        provide(NAV_CHARTS, { useValue: charts }),
        ReactorCore,
        Outpost,
      ],
    })
    class Frontier {}
    const ship = await Nexus.create(Frontier);
    const outpost = ship.get(Outpost);
    order.push(outpost.charts.plot(), String(outpost.reactor().output));
    expect(order).toEqual(['sector-7', '1.21']);
  });

  it('injects properties into a class registered through useClass', async () => {
    class Bridge {
      @Inject(NAV_CHARTS) accessor charts!: NavCharts;
    }
    const BRIDGE = new Token<Bridge>('Bridge');
    @Module({
      providers: [
        provide(NAV_CHARTS, { useValue: charts }),
        provide(BRIDGE, { useClass: Bridge }),
      ],
    })
    class Command {}
    expect((await Nexus.create(Command)).get(BRIDGE).charts).toBe(charts);
  });

  it('throws NEXUS_LEGACY_DECORATORS when called the experimentalDecorators way', () => {
    const legacy = Inject(NAV_CHARTS) as unknown as (
      target: object,
      key: string,
      descriptor: object,
    ) => void;
    expect(thrown(() => legacy({}, 'charts', {}))).toMatchObject({
      code: 'NEXUS_LEGACY_DECORATORS',
      decorator: 'Inject',
    });
  });
});

describe('Module', () => {
  it('turns a class into a module named after the class', async () => {
    @Module({ providers: [ReactorCore], exports: [ReactorCore] })
    class Engineering {}
    @Module({ imports: [Engineering] })
    class Meridian {}
    const ship = await Nexus.create(Meridian);
    expect(ship.get(ReactorCore)).toBeInstanceOf(ReactorCore);
    expect(ship.graph().modules.map((m) => m.name)).toEqual([
      'Meridian',
      'Engineering',
    ]);
  });

  it('throws NEXUS_LEGACY_DECORATORS when called the experimentalDecorators way', () => {
    const legacy = Module({}) as unknown as (target: unknown) => void;
    expect(thrown(() => legacy(class Command {}))).toMatchObject({
      code: 'NEXUS_LEGACY_DECORATORS',
      decorator: 'Module',
    });
  });
});
