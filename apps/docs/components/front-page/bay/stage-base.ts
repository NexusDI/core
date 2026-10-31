import type { SchematicBase } from '@nexusdi/meridian-ui';

import { cutawayBase } from '../art';

/**
 * The one seam under the bay's stage. The painted, lit cutaway is the base
 * today. A later change swaps this function for an unlit base with a light
 * layer, and the controller, the overlay and the state tint layer stay as they
 * are: the stage reads its room, fixture and door state from the single table
 * `ShipView.light` (owner ruling OR5).
 */
export function stageBase(sizes: string): SchematicBase {
  return cutawayBase(sizes);
}
