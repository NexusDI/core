import { Token, defineModule, provide, type ModuleRef } from '@nexusdi/core';

import { COMMAND_LINK, NAV_CHARTS, STATION_TELEMETRY } from './index.js';
import type {
  CommandReceipt,
  ICommandLink,
  StationCommand,
} from './command-link.js';
import type { Course, INavCharts } from './nav-charts.js';
import type { IStationTelemetry, TelemetryState } from './station-telemetry.js';

/** The heading every plotted course takes. */
export const FAKE_HEADING = 42;

/** The tick every recorded command is queued at. */
export const RECORDED_TICK = 3;

/** A command link that records what it is sent. */
export interface IRecordingLink extends ICommandLink {
  /** The commands sent so far, in order. */
  readonly sent: readonly StationCommand[];
}

/** A telemetry feed a test drives by hand. */
export interface IFakeTelemetry extends IStationTelemetry {
  /** The listeners subscribed now, in subscription order. */
  readonly listeners: readonly (() => void)[];
  /** Replaces the state and calls every listener. */
  show(state: TelemetryState): void;
}

export const RECORDING_LINK = new Token<IRecordingLink>('RecordingLink');
export const FAKE_TELEMETRY = new Token<IFakeTelemetry>('FakeTelemetry');

/** Star charts that put every destination at FAKE_HEADING. */
export class FixedNavCharts implements INavCharts {
  plot(to: string): Course {
    return { to, heading: FAKE_HEADING };
  }
}

/**
 * Queues every command at RECORDED_TICK and keeps it. The testing container
 * builds a new one per test, so each test starts with nothing sent.
 */
export class RecordingCommandLink implements IRecordingLink {
  readonly sent: StationCommand[] = [];

  async send(command: StationCommand): Promise<CommandReceipt> {
    this.sent.push(command);
    return { queued: true, tick: RECORDED_TICK, text: 'queued' };
  }
}

/** A feed that starts connecting, with no reading, and holds what `show` gives it. */
export class FakeStationTelemetry implements IFakeTelemetry {
  readonly listeners: (() => void)[] = [];
  private current: TelemetryState = { status: 'connecting', reading: null };

  readonly subscribe: IStationTelemetry['subscribe'] = (listener) => {
    this.listeners.push(listener);
    return () => {
      const at = this.listeners.indexOf(listener);
      if (at !== -1) this.listeners.splice(at, 1);
    };
  };

  readonly state: IStationTelemetry['state'] = () => this.current;

  show(state: TelemetryState): void {
    this.current = state;
    for (const listener of [...this.listeners]) listener();
  }
}

/**
 * What the shell's Tactical gives a loaded remote, over fakes: the three
 * contract tokens, and the doubles behind two of them for a test to read.
 */
export const FakeTactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, { useClass: FixedNavCharts }),
    provide(RECORDING_LINK, { useClass: RecordingCommandLink }),
    provide(COMMAND_LINK, { useExisting: RECORDING_LINK }),
    provide(FAKE_TELEMETRY, { useClass: FakeStationTelemetry }),
    provide(STATION_TELEMETRY, { useExisting: FAKE_TELEMETRY }),
  ],
  exports: [
    NAV_CHARTS,
    COMMAND_LINK,
    STATION_TELEMETRY,
    RECORDING_LINK,
    FAKE_TELEMETRY,
  ],
  global: true,
});

/** A ship root that imports FakeTactical and the station under test. */
export function stationRoot(station: ModuleRef) {
  return defineModule({
    name: 'Meridian',
    imports: [FakeTactical, station],
  });
}
