import { Token, defineModule, provide } from '@nexusdi/core';
import {
  COMMAND_LINK,
  STATION_TELEMETRY,
  type CommandReceipt,
  type ICommandLink,
  type IStationTelemetry,
  type TelemetryState,
} from '@nexusdi/federation-contracts';

/** One compartment's air: a label and its text per gauge. */
export interface CompartmentGauges {
  readonly id: string;
  readonly gauges: readonly (readonly [label: string, text: string])[];
}

/** The atmosphere desk: the telemetry feed, the air by compartment and three crew commands. */
export interface IAtmosphereDesk {
  readonly subscribe: IStationTelemetry['subscribe'];
  readonly state: IStationTelemetry['state'];
  /** `null` until the stream has sent a reading. */
  compartments(state: TelemetryState): readonly CompartmentGauges[] | null;
  online(): Promise<CommandReceipt>;
  scrubber(compartment: string, on: boolean): Promise<CommandReceipt>;
  oxygen(compartment: string, on: boolean): Promise<CommandReceipt>;
}

export const ATMOSPHERE_DESK = new Token<IAtmosphereDesk>('AtmosphereDesk');

const KILO = 1000;

/**
 * Reads this remote's copies of the contract's STATION_TELEMETRY and
 * COMMAND_LINK. federation() binds them to the ones the shell's Tactical
 * provides, by their keys `meridian/StationTelemetry` and `meridian/CommandLink`.
 */
class AtmosphereDesk implements IAtmosphereDesk {
  static deps = [STATION_TELEMETRY, COMMAND_LINK] as const;

  readonly subscribe: IStationTelemetry['subscribe'];
  readonly state: IStationTelemetry['state'];

  constructor(
    feed: IStationTelemetry,
    private readonly link: ICommandLink,
  ) {
    this.subscribe = feed.subscribe;
    this.state = feed.state;
  }

  compartments({
    reading,
  }: TelemetryState): readonly CompartmentGauges[] | null {
    if (!reading) return null;
    return Object.entries(reading.compartments).map(([id, air]) => {
      const total = Object.values(air.moles).reduce((sum, n) => sum + n, 0);
      // An evacuated compartment holds no moles, so every partial is zero.
      const partial = (gas: string) =>
        total > 0
          ? ((air.pressure * (air.moles[gas] ?? 0)) / total / KILO).toFixed(2)
          : (0).toFixed(2);
      return {
        id,
        gauges: [
          ['Temperature', `${air.temperature.toFixed(1)} K`],
          ['Pressure', `${(air.pressure / KILO).toFixed(1)} kPa`],
          ['O₂ partial pressure', `${partial('O2')} kPa`],
          ['CO₂ partial pressure', `${partial('CO2')} kPa`],
        ],
      };
    });
  }

  online() {
    return this.link.send({ system: 'life-support', action: 'online' });
  }

  scrubber(compartment: string, on: boolean) {
    return this.link.send({
      system: 'life-support',
      action: 'scrubber',
      compartment,
      on,
    });
  }

  oxygen(compartment: string, on: boolean) {
    return this.link.send({
      system: 'life-support',
      action: 'oxygen',
      compartment,
      on,
    });
  }
}

/** The life-support station's section. The shell adds it with load(). */
export const LifeSupportStation = defineModule({
  name: 'LifeSupportStation',
  providers: [provide(ATMOSPHERE_DESK, { useClass: AtmosphereDesk })],
  exports: [ATMOSPHERE_DESK],
});
