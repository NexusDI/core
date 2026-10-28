import { type CoolantRating, LITHIUM_LOOP } from '../../physics/thermal';

import type { ICoolantLoop } from './contracts';

/** The Meridian's lithium coolant loop and its louvred radiators. */
export class RadiatorLoop implements ICoolantLoop {
  readonly rating: CoolantRating = LITHIUM_LOOP;
}
