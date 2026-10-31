import { Schematic } from '@nexusdi/meridian-ui';

import { cutawayBase, unlitCutawayBase } from './art';
import { schematicMarkup, seedStates } from './seed-ship';

/**
 * The painted cutaway with the lit seed on it (site UX spec 4.3 and 4.4). The
 * server renders it, so a reader without JavaScript sees the ship that passes
 * the check. The bay's controller adds the hotspots and the states of a drill
 * to the same component.
 */
export default function Cutaway({
  sizes,
  scope = 'bay',
  className,
  unlit = false,
}: {
  sizes: string;
  scope?: string;
  className?: string;
  /** The bay's unlit base, which the deck view lights. The strip's crops keep the lit one. */
  unlit?: boolean;
}) {
  const { rooms, fixtures, doors } = seedStates();
  return (
    <Schematic
      markup={schematicMarkup()}
      base={unlit ? unlitCutawayBase(sizes) : cutawayBase(sizes)}
      rooms={rooms}
      fixtures={fixtures}
      doors={doors}
      scope={scope}
      className={className}
    />
  );
}
