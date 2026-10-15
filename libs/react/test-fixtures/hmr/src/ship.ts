import { Nexus, provide } from '@nexusdi/core';

import { FLIGHT_LOG } from './contracts';
import { ShuttleFlightLog } from './flight-log';

export const shipReady = Nexus.create([
  provide(FLIGHT_LOG, { useClass: ShuttleFlightLog }),
]);
