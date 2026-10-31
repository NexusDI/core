import {
  Token,
  defineModule,
  provide,
  type ExportEntry,
  type ModuleRef,
} from '@nexusdi/core';

/**
 * The front page's pre-flight bay (site-ux 4.3 and 5.1): the parts of the
 * Meridian program, the state of the ship and the pure `rootOf(state)` that
 * builds the root module for a state. The region `meridian` of
 * `pages/index.md` is the same program written out for readers, and a test
 * asserts that `inspect()` of `rootOf(SEED)` and of that region agree.
 *
 * The docs app loads this file in the browser and `scene-fixtures.mjs` loads
 * it in Node with type stripping, so it uses only erasable syntax.
 */

export interface IReactorCore {
  readonly output: number;
}
export interface IShipComputer {
  status(): string;
}
export interface ISubspaceLink {
  readonly frequency: number;
  send(message: string): string;
}
export interface INavCharts {
  plot(target: string): string;
}
export interface ISurveyDrone {
  survey(target: string): string;
}
export interface IFlightLog {
  readonly entries: string[];
}
export interface IDiagnosticsPanel {
  report(): string;
}
export interface CommsOptions {
  readonly frequency: number;
  readonly transport: 'relay' | 'laser';
}

export const REACTOR = new Token<IReactorCore>('ReactorCore');
export const COMPUTER = new Token<IShipComputer>('ShipComputer');
export const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
export const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
export const NAV_CHARTS = new Token<INavCharts>('NavCharts');
export const DRONE = new Token<ISurveyDrone>('SurveyDrone');
export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
export const DIAGNOSTICS_PANEL = new Token<IDiagnosticsPanel>(
  'DiagnosticsPanel',
);

/** The 400 ms chart download of `NAV_CHARTS`' factory (site-ux 4.4). */
export const CHART_DOWNLOAD_MS = 400;

/** The message the factory rejects with when the chart server is unreachable. */
export const CHART_SERVER_DOWN = 'chart server unreachable';

/**
 * What the disposers write, in the order core ran them. A launch reads it
 * after the ship is gone; `clearShutdownLog` empties it before the next
 * launch.
 */
const shutdown: string[] = [];
export const shutdownLog: readonly string[] = shutdown;
export function clearShutdownLog(): void {
  shutdown.length = 0;
}

export class FusionReactor implements IReactorCore {
  readonly output = 1.21;
  async [Symbol.asyncDispose]() {
    shutdown.push('reactor scram: control rods dropped');
  }
}
export class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  private readonly reactor: IReactorCore;
  constructor(reactor: IReactorCore) {
    this.reactor = reactor;
  }
  status() {
    return `ShipComputer online. Reactor output ${this.reactor.output} GW.`;
  }
}
export class SubspaceRelay implements ISubspaceLink {
  readonly frequency: number;
  constructor(frequency: number) {
    this.frequency = frequency;
  }
  send(message: string) {
    return `relay ${this.frequency}: ${message}`;
  }
  [Symbol.dispose]() {
    shutdown.push('subspace link closed');
  }
}
export class LaserLink implements ISubspaceLink {
  readonly frequency: number;
  constructor(frequency: number) {
    this.frequency = frequency;
  }
  send(message: string) {
    return `laser ${this.frequency}: ${message}`;
  }
  [Symbol.dispose]() {
    shutdown.push('subspace link closed');
  }
}
export class ScoutDrone implements ISurveyDrone {
  static deps = [COMPUTER] as const;
  private readonly computer: IShipComputer;
  constructor(computer: IShipComputer) {
    this.computer = computer;
  }
  survey(target: string) {
    return `${target} surveyed. ${this.computer.status()}`;
  }
}
export class ShuttleFlightLog implements IFlightLog {
  readonly entries: string[] = [];
}
export class StatusBoard implements IDiagnosticsPanel {
  static deps = [COMPUTER, SUBSPACE_LINK] as const;
  private readonly computer: IShipComputer;
  private readonly link: ISubspaceLink;
  constructor(computer: IShipComputer, link: ISubspaceLink) {
    this.computer = computer;
    this.link = link;
  }
  report() {
    return this.link.send(this.computer.status());
  }
}

/** The module imports of the ship, "importer>imported": one conduit each (site-ux 4.3). */
export const CONDUITS = [
  'Tactical>Engineering',
  'Tactical>Comms',
  'Meridian>Engineering',
  'Meridian>Comms',
  'Meridian>Tactical',
  'Meridian>BridgeApi',
] as const;
export type ConduitId = (typeof CONDUITS)[number];

/** The providers, by the description of their token. */
export const SYSTEMS = [
  'ReactorCore',
  'ShipComputer',
  'SubspaceLink',
  'NavCharts',
  'SurveyDrone',
  'FlightLog',
  'DiagnosticsPanel',
] as const;
export type SystemId = (typeof SYSTEMS)[number];

/** The exports of the ship, by the description of their token. */
export const HATCHES = [
  'ShipComputer',
  'SubspaceLink',
  'NavCharts',
  'SurveyDrone',
  'FlightLog',
] as const;
export type HatchId = (typeof HATCHES)[number];

/**
 * The state of the ship: whether each conduit, system and hatch is intact,
 * and the chart-server switch. `true` is intact: an import in place, a
 * provider declared, an export listed, the server reachable.
 */
export interface FrontPageState {
  readonly conduits: Readonly<Record<ConduitId, boolean>>;
  readonly systems: Readonly<Record<SystemId, boolean>>;
  readonly hatches: Readonly<Record<HatchId, boolean>>;
  readonly chartServerReachable: boolean;
}

function allIntact<K extends string>(
  keys: readonly K[],
): Readonly<Record<K, boolean>> {
  return Object.freeze(
    Object.fromEntries(keys.map((key) => [key, true])),
  ) as Readonly<Record<K, boolean>>;
}

/** The ship as the region `meridian` builds it. */
export const SEED: FrontPageState = Object.freeze({
  conduits: allIntact(CONDUITS),
  systems: allIntact(SYSTEMS),
  hatches: allIntact(HATCHES),
  chartServerReachable: true,
});

/** A copy of `state` with the named entries changed. */
export function amend(
  state: FrontPageState,
  change: {
    readonly conduits?: Partial<Record<ConduitId, boolean>>;
    readonly systems?: Partial<Record<SystemId, boolean>>;
    readonly hatches?: Partial<Record<HatchId, boolean>>;
    readonly chartServerReachable?: boolean;
  },
): FrontPageState {
  return Object.freeze({
    conduits: Object.freeze({ ...state.conduits, ...change.conduits }),
    systems: Object.freeze({ ...state.systems, ...change.systems }),
    hatches: Object.freeze({ ...state.hatches, ...change.hatches }),
    chartServerReachable:
      change.chartServerReachable ?? state.chartServerReachable,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/**
 * The root module `Meridian` for a state. Pure: each call defines fresh
 * modules and holds no state of its own, so a check and a launch of one state
 * see one graph. The order of providers, imports and exports matches the
 * region, so the seed's graph carries the same ids.
 */
export function rootOf(state: FrontPageState) {
  const { conduits, systems, hatches } = state;

  const Engineering = defineModule({
    name: 'Engineering',
    providers: [
      ...(systems.ReactorCore
        ? [provide(REACTOR, { useClass: FusionReactor })]
        : []),
      ...(systems.ShipComputer
        ? [provide(COMPUTER, { useClass: QuantumComputer })]
        : []),
    ],
    exports: hatches.ShipComputer ? [COMPUTER] : [],
  });

  const Comms = defineModule({
    name: 'Comms',
    options: COMMS_OPTIONS,
    providers: [
      ...(systems.SubspaceLink
        ? [
            provide(SUBSPACE_LINK, {
              useFactory: (options) =>
                options.transport === 'laser'
                  ? new LaserLink(options.frequency)
                  : new SubspaceRelay(options.frequency),
              deps: [COMMS_OPTIONS],
            }),
          ]
        : []),
    ],
    exports: hatches.SubspaceLink ? [SUBSPACE_LINK] : [],
  });

  const ShipComms = Comms.forRoot({ frequency: 1420, transport: 'laser' });

  const tacticalExports: ExportEntry[] = [];
  if (hatches.NavCharts) tacticalExports.push(NAV_CHARTS);
  if (hatches.SurveyDrone) tacticalExports.push(DRONE);
  const tacticalImports: ModuleRef[] = [];
  if (conduits['Tactical>Engineering']) tacticalImports.push(Engineering);
  if (conduits['Tactical>Comms']) tacticalImports.push(ShipComms);

  const Tactical = defineModule({
    name: 'Tactical',
    imports: tacticalImports,
    providers: [
      ...(systems.NavCharts
        ? [
            provide(NAV_CHARTS, {
              useFactory: async (link) => {
                await delay(CHART_DOWNLOAD_MS);
                if (!state.chartServerReachable)
                  throw new Error(CHART_SERVER_DOWN);
                return {
                  plot: (target: string) => link.send(`course to ${target}`),
                };
              },
              deps: [SUBSPACE_LINK],
            }),
          ]
        : []),
      ...(systems.SurveyDrone
        ? [provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' })]
        : []),
    ],
    exports: tacticalExports,
  });

  const BridgeApi = defineModule({
    name: 'BridgeApi',
    providers: [
      ...(systems.FlightLog
        ? [
            provide(FLIGHT_LOG, {
              useClass: ShuttleFlightLog,
              lifetime: 'scoped',
            }),
          ]
        : []),
    ],
    exports: hatches.FlightLog ? [FLIGHT_LOG] : [],
  });

  const rootImports: ModuleRef[] = [];
  if (conduits['Meridian>Engineering']) rootImports.push(Engineering);
  if (conduits['Meridian>Comms']) rootImports.push(ShipComms);
  if (conduits['Meridian>Tactical']) rootImports.push(Tactical);
  if (conduits['Meridian>BridgeApi']) rootImports.push(BridgeApi);

  return defineModule({
    name: 'Meridian',
    imports: rootImports,
    providers: [
      ...(systems.DiagnosticsPanel
        ? [provide(DIAGNOSTICS_PANEL, { useClass: StatusBoard })]
        : []),
    ],
  });
}
