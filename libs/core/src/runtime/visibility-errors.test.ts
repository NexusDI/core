import { describe, expect, it } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { MultiToken, Token } from '../definitions/token.js';
import { BlueprintError, type NexusError } from '../errors/index.js';
import { Nexus } from './nexus.js';

interface IReactor {
  readonly output: number;
}
interface IShields {
  readonly reactor: IReactor;
}
interface IComms {
  readonly frequency: number;
}
interface ISensor {
  readonly range: number;
}

const REACTOR = new Token<IReactor>('Reactor');
const SHIELDS = new Token<IShields>('Shields');
const COMMS = new Token<IComms>('Comms');
const FREQUENCY = new Token<number>('Frequency');
const SENSORS = new MultiToken<ISensor>('Sensors');

class FusionReactor implements IReactor {
  readonly output = 1;
}
class DeflectorShields implements IShields {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactor) {}
}
class SubspaceComms implements IComms {
  static deps = [FREQUENCY] as const;
  constructor(readonly frequency: number) {}
}
class LongRangeSensor implements ISensor {
  readonly range = 10;
}

/**
 * The errors of a BlueprintError as a set: class name, code and fields,
 * sorted. The order errors come in is not part of the contract.
 */
function errorSet(error: unknown): object[] {
  expect(error).toBeInstanceOf(BlueprintError);
  return (error as BlueprintError).errors
    .map((e: NexusError) => ({
      class: e.constructor.name,
      code: e.code,
      ...Object.fromEntries(Object.entries(e)),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function sorted(list: object[]): object[] {
  return [...list].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
}

const missing = (fields: {
  token: string;
  requester: string;
  module: string;
}) => ({
  class: 'MissingProviderError',
  code: 'NEXUS_MISSING_PROVIDER',
  entry: null,
  // Core leaves nearMisses empty; @nexusdi/errors fills it from the view.
  nearMisses: [],
  ...fields,
});
const invalidExport = (token: string, module: string) => ({
  class: 'InvalidExportError',
  code: 'NEXUS_INVALID_EXPORT',
  token,
  module,
});
const ambiguous = (token: string, module: string, candidates: string[]) => ({
  class: 'AmbiguousProviderError',
  code: 'NEXUS_AMBIGUOUS_PROVIDER',
  token,
  module,
  candidates,
});

function reactorModule(name: string, exported = true) {
  return defineModule({
    name,
    providers: [provide(REACTOR, { useClass: FusionReactor })],
    exports: exported ? [REACTOR] : [],
  });
}

function shieldsModule(name: string, imports: readonly unknown[]) {
  return defineModule({
    name,
    imports: imports as never,
    providers: [provide(SHIELDS, { useClass: DeflectorShields })],
    exports: [SHIELDS],
  });
}

describe('visibility errors across modules', () => {
  it('reports a dep its import provides and does not export', () => {
    const Engineering = reactorModule('Engineering', false);
    const Tactical = shieldsModule('Tactical', [Engineering]);
    expect(
      errorSet(
        thrown(() =>
          Nexus.check(defineModule({ name: 'Bridge', imports: [Tactical] })),
        ),
      ),
    ).toEqual([
      missing({
        token: 'Reactor',
        requester: 'Shields',
        module: 'Tactical',
      }),
    ]);
  });

  it('reports a dep exported by a module the requester does not import', () => {
    const Engineering = reactorModule('Engineering');
    const Tactical = shieldsModule('Tactical', []);
    expect(
      errorSet(
        thrown(() =>
          Nexus.check(
            defineModule({ name: 'Bridge', imports: [Tactical, Engineering] }),
          ),
        ),
      ),
    ).toEqual([
      missing({
        token: 'Reactor',
        requester: 'Shields',
        module: 'Tactical',
      }),
    ]);
  });

  it('reports an export of a token the module cannot see, and of one a non-imported module exports', () => {
    const Engineering = reactorModule('Engineering');
    const Tactical = defineModule({
      name: 'Tactical',
      exports: [REACTOR, COMMS],
    });
    expect(
      errorSet(
        thrown(() =>
          Nexus.check(
            defineModule({ name: 'Bridge', imports: [Engineering, Tactical] }),
          ),
        ),
      ),
    ).toEqual(
      sorted([
        invalidExport('Reactor', 'Tactical'),
        invalidExport('Comms', 'Tactical'),
      ]),
    );
  });

  it('reports a token two imports export from different providers', () => {
    const Port = reactorModule('Port');
    const Starboard = reactorModule('Starboard');
    const Tactical = shieldsModule('Tactical', [Port, Starboard]);
    expect(
      errorSet(
        thrown(() =>
          Nexus.check(defineModule({ name: 'Bridge', imports: [Tactical] })),
        ),
      ),
    ).toEqual([ambiguous('Reactor', 'Tactical', ['Port', 'Starboard'])]);
  });

  it('reports a token an import and a global module both export', () => {
    const Port = reactorModule('Port');
    const Grid = defineModule({
      name: 'Grid',
      global: true,
      providers: [provide(REACTOR, { useClass: FusionReactor })],
      exports: [REACTOR],
    });
    const Tactical = shieldsModule('Tactical', [Port]);
    expect(
      errorSet(
        thrown(() =>
          Nexus.check(
            defineModule({ name: 'Bridge', imports: [Grid, Tactical] }),
          ),
        ),
      ),
    ).toEqual([ambiguous('Reactor', 'Tactical', ['Port', 'Grid'])]);
  });

  it('reports ambiguity in every module of a re-export cycle a global module closes', () => {
    const Port = reactorModule('Port');
    const Starboard = reactorModule('Starboard');
    const K1 = defineModule({
      name: 'K1',
      imports: [Port],
      exports: [REACTOR],
    });
    const K2 = defineModule({
      name: 'K2',
      imports: [Starboard],
      exports: [REACTOR],
    });
    const Fleet = defineModule({
      name: 'Fleet',
      global: true,
      imports: [K1, K2],
      exports: [K1, K2],
    });
    const Tactical = shieldsModule('Tactical', []);
    expect(
      errorSet(
        thrown(() =>
          Nexus.check(
            defineModule({ name: 'Bridge', imports: [Fleet, Tactical] }),
          ),
        ),
      ),
    ).toEqual(
      sorted([
        ambiguous('Reactor', 'Bridge', ['Fleet', 'Fleet']),
        ambiguous('Reactor', 'Fleet', ['K1', 'K2', 'K1', 'K2']),
        ambiguous('Reactor', 'K1', ['Port', 'Fleet', 'Fleet']),
        ambiguous('Reactor', 'K2', ['Starboard', 'Fleet', 'Fleet']),
        ambiguous('Reactor', 'Tactical', ['Fleet', 'Fleet']),
      ]),
    );
  });

  it('reports the options token of two forRoot() instances as ambiguous, and a missing one when not exported', () => {
    const Radio = defineModule({
      name: 'Radio',
      options: FREQUENCY,
      exports: [FREQUENCY],
    });
    const Quiet = defineModule({ name: 'Quiet', options: FREQUENCY });
    const Relay = defineModule({
      name: 'Relay',
      imports: [Radio.forRoot(1), Radio.forRoot(2)],
      providers: [provide(COMMS, { useClass: SubspaceComms })],
    });
    const Beacon = defineModule({
      name: 'Beacon',
      imports: [Quiet.forRoot(3)],
      providers: [provide(COMMS, { useClass: SubspaceComms })],
    });
    expect(
      errorSet(
        thrown(() =>
          Nexus.check(
            defineModule({ name: 'Bridge', imports: [Relay, Beacon] }),
          ),
        ),
      ),
    ).toEqual(
      sorted([
        ambiguous('Frequency', 'Relay', ['Radio', 'Radio']),
        missing({
          token: 'Frequency',
          requester: 'Comms',
          module: 'Beacon',
        }),
      ]),
    );
  });

  it('reports every visibility error of one graph from check() and create()', async () => {
    const Hidden = reactorModule('Hidden', false);
    const Port = reactorModule('Port');
    const Starboard = reactorModule('Starboard');
    const Array1 = defineModule({
      name: 'Array1',
      providers: [provide(SENSORS, { useClass: LongRangeSensor })],
      exports: [SENSORS],
    });
    const Array2 = defineModule({
      name: 'Array2',
      providers: [provide(SENSORS, { useClass: LongRangeSensor })],
      exports: [SENSORS],
    });
    const Grid = defineModule({
      name: 'Grid',
      global: true,
      imports: [Array1],
      exports: [Array1],
    });
    const Tactical = shieldsModule('Tactical', [Hidden]);
    const Helm = shieldsModule('Helm', [Port, Starboard]);
    const Comms = defineModule({
      name: 'Comms',
      imports: [Array2],
      exports: [SENSORS, COMMS],
    });
    const Bridge = defineModule({
      name: 'Bridge',
      imports: [Grid, Tactical, Helm, Comms],
    });
    const expected = sorted([
      missing({
        token: 'Reactor',
        requester: 'Shields',
        module: 'Tactical',
      }),
      ambiguous('Reactor', 'Helm', ['Port', 'Starboard']),
      // Bridge sees Shields from Tactical and Helm. Nothing depends on it,
      // and the pass still reports it.
      ambiguous('Shields', 'Bridge', ['Tactical', 'Helm']),
      invalidExport('Comms', 'Comms'),
    ]);
    expect(errorSet(thrown(() => Nexus.check(Bridge)))).toEqual(expected);
    expect(errorSet(await rejected(Nexus.create(Bridge)))).toEqual(expected);
  });
});

describe('visibility errors from load() and extend()', () => {
  it('rejects a load whose module has visibility errors and keeps the container running', async () => {
    const Engineering = reactorModule('Engineering');
    const ship = await Nexus.create(
      defineModule({ name: 'Bridge', imports: [Engineering] }),
    );
    const Port = reactorModule('Port');
    const Hidden = reactorModule('Hidden', false);
    const Science = defineModule({
      name: 'Science',
      imports: [Engineering, Port],
      providers: [provide(SHIELDS, { useClass: DeflectorShields })],
      exports: [SHIELDS, COMMS],
    });
    const Lab = shieldsModule('Lab', [Hidden]);
    const error = await rejected(ship.load(Science));
    expect(errorSet(error)).toEqual(
      sorted([
        ambiguous('Reactor', 'Science', ['Engineering', 'Port']),
        invalidExport('Comms', 'Science'),
      ]),
    );
    expect(errorSet(await rejected(ship.load(Lab)))).toEqual([
      missing({
        token: 'Reactor',
        requester: 'Shields',
        module: 'Lab',
      }),
    ]);
    expect(ship.has(SHIELDS)).toBe(false);
    expect(ship.get(REACTOR).output).toBe(1);
  });

  it('reports a loaded module ambiguous against a global module of the running graph', async () => {
    const Grid = defineModule({
      name: 'Grid',
      global: true,
      providers: [provide(REACTOR, { useClass: FusionReactor })],
      exports: [REACTOR],
    });
    const ship = await Nexus.create(
      defineModule({ name: 'Bridge', imports: [Grid] }),
    );
    const Science = shieldsModule('Science', [reactorModule('Port')]);
    expect(errorSet(await rejected(ship.load(Science)))).toEqual([
      ambiguous('Reactor', 'Science', ['Port', 'Grid']),
    ]);
  });

  it('reports the same errors from check() with load, and extend() after the failed load keeps the scope', async () => {
    const Engineering = reactorModule('Engineering');
    const Bridge = defineModule({ name: 'Bridge', imports: [Engineering] });
    const Science = defineModule({
      name: 'Science',
      imports: [Engineering, reactorModule('Port')],
      providers: [provide(SHIELDS, { useClass: DeflectorShields })],
      exports: [SHIELDS, COMMS],
    });
    const expected = sorted([
      ambiguous('Reactor', 'Science', ['Engineering', 'Port']),
      invalidExport('Comms', 'Science'),
    ]);
    expect(
      errorSet(thrown(() => Nexus.check(Bridge, { load: [Science] }))),
    ).toEqual(expected);

    const ship = await Nexus.create(Bridge);
    const shuttle = await ship.createScope();
    expect(errorSet(await rejected(ship.load(Science)))).toEqual(expected);
    await shuttle.extend();
    expect(shuttle.has(SHIELDS)).toBe(false);
    expect(shuttle.get(REACTOR)).toBe(ship.get(REACTOR));
  });
});
