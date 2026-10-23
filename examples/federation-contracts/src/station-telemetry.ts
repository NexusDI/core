/** One compartment's air. Kelvin, pascals and moles. */
export interface CompartmentTelemetry {
  readonly temperature: number;
  readonly pressure: number;
  readonly moles: Readonly<Record<string, number>>;
}

/** The parts of a ship reading the stations show. Watts, kelvin, pascals. */
export interface TelemetryReading {
  readonly tick: number;
  readonly reactor: { readonly level: number; readonly electric: number };
  readonly coolant: { readonly temperature: number };
  readonly power: {
    readonly loads: readonly {
      readonly id: string;
      readonly allocated: number;
    }[];
    readonly shed: readonly string[];
  };
  readonly compartments: Readonly<Record<string, CompartmentTelemetry>>;
}

/** The stream's status and the last reading it sent. */
export interface TelemetryState {
  readonly status: 'connecting' | 'online' | 'offline';
  readonly reading: TelemetryReading | null;
}

/** The ship's telemetry, shaped for useSyncExternalStore. Both members are bound. */
export interface IStationTelemetry {
  /** The first listener opens the stream and the last one's unsubscribe closes it. */
  readonly subscribe: (listener: () => void) => () => void;
  /** The same object until the stream sends a reading or changes status. */
  readonly state: () => TelemetryState;
}
