import { Schematic } from '@nexusdi/meridian-ui';

import { unlitCutawayBase } from './art';
import { schematicMarkup, seedStates } from './seed-ship';

/**
 * The unlit cutaway with the seed tints on it (site UX spec 4.3 and 4.4). The
 * server renders it, so a reader without JavaScript sees the ship that passes
 * the check. The bay's controller adds the hotspots and the states of a drill
 * to the same component.
 */
export default function Cutaway({
  sizes,
  scope = 'bay',
  className,
}: {
  sizes: string;
  scope?: string;
  className?: string;
}) {
  const { rooms, fixtures, doors } = seedStates();
  return (
    <Schematic
      markup={schematicMarkup()}
      base={unlitCutawayBase(sizes)}
      rooms={rooms}
      fixtures={fixtures}
      doors={doors}
      scope={scope}
      className={className}
    />
  );
}
