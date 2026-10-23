import { Token, defineModule, provide } from '@nexusdi/core';
import {
  TELEMETRY_FEED,
  type IStationTelemetry,
  type TelemetryState,
} from '@nexusdi/federation-contracts';

/** A gauge's label and its text. */
export type Gauge = readonly [label: string, text: string];

/** The engine room: the telemetry feed and the gauges read off a reading. */
export interface IEngineRoom {
  readonly subscribe: IStationTelemetry['subscribe'];
  readonly state: IStationTelemetry['state'];
  /** `null` until the stream has sent a reading. */
  gauges(state: TelemetryState): readonly Gauge[] | null;
}

export const ENGINE_ROOM = new Token<IEngineRoom>('EngineRoom');

const MEGA = 1_000_000;

/** Thousands grouped, `places` decimals. */
function grouped(value: number, places: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  }).format(value);
}

/**
 * Reads this remote's copy of the contract's TELEMETRY_FEED. federation()
 * binds that copy to the one the shell's Tactical provides, by its key
 * `meridian/StationTelemetry`.
 */
class EngineRoom implements IEngineRoom {
  static deps = [TELEMETRY_FEED] as const;

  readonly subscribe: IStationTelemetry['subscribe'];
  readonly state: IStationTelemetry['state'];

  constructor(feed: IStationTelemetry) {
    this.subscribe = (listener) => feed.subscribe(listener);
    this.state = () => feed.state();
  }

  gauges({ reading }: TelemetryState): readonly Gauge[] | null {
    if (!reading) return null;
    const allocated = reading.power.loads.reduce(
      (sum, load) => sum + load.allocated,
      0,
    );
    const shed = reading.power.shed;
    return [
      ['Reactor level', reading.reactor.level.toFixed(2)],
      ['Electric output', `${grouped(reading.reactor.electric / MEGA, 1)} MW`],
      ['Coolant', `${grouped(reading.coolant.temperature, 1)} K`],
      ['Power allocated', `${grouped(allocated / MEGA, 1)} MW`],
      ['Loads shed', shed.length === 0 ? 'none' : shed.join(', ')],
    ];
  }
}

/** The engineering station's section. The shell adds it with load(). */
export const EngineeringStation = defineModule({
  name: 'EngineeringStation',
  providers: [provide(ENGINE_ROOM, { useClass: EngineRoom })],
  exports: [ENGINE_ROOM],
});
