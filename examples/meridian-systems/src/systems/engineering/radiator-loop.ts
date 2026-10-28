import type { CoolantRating, ICoolantLoop } from './contracts';
import { LITHIUM_LOOP } from './engineering-model';

/** The Meridian's lithium coolant loop and its louvred radiators. */
export class RadiatorLoop implements ICoolantLoop {
  readonly rating: CoolantRating = LITHIUM_LOOP;
}
