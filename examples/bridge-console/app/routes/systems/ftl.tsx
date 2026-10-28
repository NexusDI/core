import type { ShipReading } from '@nexusdi/meridian-systems';
import { Form } from 'react-router';

import { Button } from '../../components';
import type { CommandAnswer } from '../../di/contracts';
import { fixed, megawatts } from '../../fixed';
import { snapshotLoader } from '../snapshot-loader.server';
import type { Route } from './+types/ftl';
import { allocated } from './allocated';
import { ftlAction } from './system-action.server';
import {
  ControlSection,
  Gauges,
  SnapshotOffline,
  SystemPage,
} from './system-page';
import { StarSelect } from './star-select';

/** Sends the submitted form to bridge-api as an FTL spool or jump. */
export const action: (args: Route.ActionArgs) => Promise<CommandAnswer> =
  ftlAction();

/**
 * The ship snapshot, which holds the FTL drive's record and its load. It is
 * null when the call fails, and the page shows it offline.
 */
export const loader: (args: Route.LoaderArgs) => Promise<ShipReading | null> =
  snapshotLoader;

/**
 * The drive's status, whether it is armed, its charge in GJ, the power the
 * spool draws, the ship's sector and the tick of the last jump.
 */
function FtlGauges({ ship }: { ship: ShipReading }) {
  const { status, charge, sector, jumped } = ship.ftl;
  return (
    <ControlSection title="FTL drive">
      <Gauges
        label="FTL gauges"
        gauges={[
          ['Status', status],
          ['Armed', ship.setpoints.ftl.armed ? 'Yes' : 'No'],
          ['Spool charge', `${fixed(charge / 1e9, 1)} GJ`],
          ['Spool power', megawatts(allocated(ship, 'ftl-spool'))],
          ['Sector', sector],
          ['Last jump', jumped === null ? 'none' : `tick ${jumped}`],
        ]}
      />
    </ControlSection>
  );
}

export default function Ftl({
  loaderData: ship,
  actionData,
}: Route.ComponentProps) {
  return (
    <SystemPage answer={actionData}>
      {ship === null ? <SnapshotOffline /> : <FtlGauges ship={ship} />}
      <ControlSection title="Spool">
        <Form method="post">
          <Button type="submit" name="command" value="spool">
            Spool drive
          </Button>
        </Form>
      </ControlSection>
      <ControlSection title="Jump">
        <StarSelect command="jump" button="Jump" />
      </ControlSection>
    </SystemPage>
  );
}
