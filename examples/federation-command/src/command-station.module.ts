import { Token, provide } from '@nexusdi/core';
import { Inject, Injectable, Module } from '@nexusdi/decorators';
import {
  COMMAND_LINK,
  NAV_CHARTS,
  STATION_TELEMETRY,
  type CommandReceipt,
  type ICommandLink,
  type INavCharts,
  type IStationTelemetry,
  type TelemetryState,
} from '@nexusdi/federation-contracts';

/** The station's course plotter. */
export interface ICoursePlotter {
  course(to: string): string;
}

export const COURSE_PLOTTER = new Token<ICoursePlotter>('CoursePlotter');

/** The helm orders the command panel sends. */
export interface IHelmOrders {
  /** Sends `helm course` to the charted star `to`. */
  course(to: string): Promise<CommandReceipt>;
  /** Sends `helm burn` at `level`, 0 to 1. */
  burn(level: number): Promise<CommandReceipt>;
}

export const HELM_ORDERS = new Token<IHelmOrders>('HelmOrders');

/** The reactor orders the command panel sends. */
export interface IReactorOrders {
  /** Sends `engineering throttle` at `level`, 0 to 1. */
  throttle(level: number): Promise<CommandReceipt>;
}

export const REACTOR_ORDERS = new Token<IReactorOrders>('ReactorOrders');

/** The burn's allocation, read from the shell's telemetry. */
export interface IBurnBoard {
  readonly subscribe: IStationTelemetry['subscribe'];
  readonly state: IStationTelemetry['state'];
  /**
   * What the power router serves the main drive: its allocation in MW, or
   * `shed` when the router dropped it. `telemetry offline` once the stream
   * is offline, whatever reading it last held. `null` until the stream has
   * sent a reading.
   */
  served(state: TelemetryState): string | null;
}

export const BURN_BOARD = new Token<IBurnBoard>('BurnBoard');

const MEGA = 1_000_000;

/** Thousands grouped, one decimal. `format` is bound to its formatter. */
const grouped = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
}).format;

/**
 * Plots a course through the contract's NAV_CHARTS. The `@Inject` accessor
 * writes its metadata where the shell's core reads it, so the shell builds
 * this class from another bundle.
 */
export class CoursePlotter implements ICoursePlotter {
  @Inject(NAV_CHARTS) accessor charts!: INavCharts;

  course(to: string): string {
    return `course to ${to}, heading ${this.charts.plot(to).heading}`;
  }
}

/**
 * Sends helm orders over the contract's COMMAND_LINK. `@Injectable` writes
 * its deps where the shell's core reads them, so the shell builds this class
 * from another bundle.
 */
@Injectable({ deps: [COMMAND_LINK] })
export class HelmOrders implements IHelmOrders {
  constructor(private readonly link: ICommandLink) {}

  course(to: string): Promise<CommandReceipt> {
    return this.link.send({ system: 'helm', action: 'course', to });
  }

  burn(level: number): Promise<CommandReceipt> {
    return this.link.send({ system: 'helm', action: 'burn', level });
  }
}

/** Sends reactor orders over the contract's COMMAND_LINK. */
@Injectable({ deps: [COMMAND_LINK] })
export class ReactorOrders implements IReactorOrders {
  constructor(private readonly link: ICommandLink) {}

  throttle(level: number): Promise<CommandReceipt> {
    return this.link.send({ system: 'engineering', action: 'throttle', level });
  }
}

/** Reads the main drive's allocation off this remote's copy of STATION_TELEMETRY. */
@Injectable({ deps: [STATION_TELEMETRY] })
export class BurnBoard implements IBurnBoard {
  readonly subscribe: IStationTelemetry['subscribe'];
  readonly state: IStationTelemetry['state'];

  constructor(feed: IStationTelemetry) {
    this.subscribe = feed.subscribe;
    this.state = feed.state;
  }

  served({ status, reading }: TelemetryState): string | null {
    if (status === 'offline') return 'telemetry offline';
    if (!reading) return null;
    if (reading.power.shed.includes('main-drive')) return 'shed';
    const drive = reading.power.loads.find((load) => load.id === 'main-drive');
    return `${grouped((drive?.allocated ?? 0) / MEGA)} MW`;
  }
}

/**
 * The command station's section, written as an `@Module` class. `name`
 * keeps the module's name in graph(ship) after the production minifier
 * renames the class.
 */
@Module({
  name: 'CommandStation',
  providers: [
    provide(COURSE_PLOTTER, { useClass: CoursePlotter }),
    provide(HELM_ORDERS, { useClass: HelmOrders }),
    provide(REACTOR_ORDERS, { useClass: ReactorOrders }),
    provide(BURN_BOARD, { useClass: BurnBoard }),
  ],
  exports: [COURSE_PLOTTER, HELM_ORDERS, REACTOR_ORDERS, BURN_BOARD],
})
export class CommandStation {}
