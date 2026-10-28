import {
  COMPARTMENT,
  type CompartmentId,
  type IShipState,
  SHIP_STATE,
} from '../../simulation/contracts';

import {
  ATMOSPHERE_PROBE,
  type AtmosphereReading,
  type IAtmosphereProbe,
  type IAtmosphereSensor,
} from './contracts';

/**
 * A gas analyzer in the compartment of the scope's request. It samples the
 * compartment through the probe when the container builds it and answers
 * that sample on every `read()`, so a transient binding gives a fresh sample
 * on each `get()`.
 */
export class GasAnalyzer implements IAtmosphereSensor {
  static deps = [COMPARTMENT, SHIP_STATE, ATMOSPHERE_PROBE] as const;

  private readonly sample: AtmosphereReading<CompartmentId>;

  constructor(
    compartment: CompartmentId,
    state: IShipState,
    probe: IAtmosphereProbe,
  ) {
    const ship = state.snapshot();
    this.sample = probe.read(
      compartment,
      ship.compartments[compartment],
      ship.tick,
    );
  }

  read(): AtmosphereReading<CompartmentId> {
    return this.sample;
  }
}
