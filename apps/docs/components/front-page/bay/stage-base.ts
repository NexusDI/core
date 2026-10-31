import type { SchematicBase } from '@nexusdi/meridian-ui';

import { unlitCutawayBase } from '../art';

/**
 * The one seam under the bay's stage: the unlit cutaway (owner ruling OR5).
 * Before the deck view presents its first frame, and wherever Pixi does not
 * run, the Schematic's tints light it. Once the view presents, the canvas in
 * the Schematic's layer slot carries the room light. Both read the single
 * table `ShipView.light`, so a change of base touches neither the controller
 * nor the overlay.
 */
export function stageBase(sizes: string): SchematicBase {
  return unlitCutawayBase(sizes);
}
