import {
  ATMOSPHERE_SENSOR,
  type AtmosphereReading,
  type CompartmentId,
  type IAtmosphereSensor,
  UnknownCompartmentError,
} from '@nexusdi/meridian-systems';

import { type Refusal, refusalOf } from './refusal';

/** The status and body `GET /compartments/:id/atmosphere` answers. */
export type AtmosphereReply =
  | { readonly status: 200; readonly body: AtmosphereReading<CompartmentId> }
  | { readonly status: 404; readonly body: Refusal };

/** The one lookup the route makes; a request scope has it. */
export interface SensorScope {
  get(token: typeof ATMOSPHERE_SENSOR): IAtmosphereSensor;
}

/**
 * Reads the analyzer of the compartment the scope's request names. A
 * compartment the deck lacks answers 404 with its text: `COMPARTMENT` throws
 * `UnknownCompartmentError` while the analyzer builds, and core rethrows it
 * as it is. Any other throw is a bug, and the framework answers it with an
 * empty 500.
 */
export function answerAtmosphere(scope: SensorScope): AtmosphereReply {
  try {
    return { status: 200, body: scope.get(ATMOSPHERE_SENSOR).read() };
  } catch (error) {
    if (!(error instanceof UnknownCompartmentError)) throw error;
    return { status: 404, body: refusalOf(error) };
  }
}
