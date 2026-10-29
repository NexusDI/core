import {
  FTL_RECORD,
  type FtlRating,
  type ShipReading,
} from '@nexusdi/meridian-systems';
import { Form } from 'react-router';

import { Button } from '../../components';
import { fixed, megawatts } from '../../fixed';
import { snapshotLoader } from '../snapshot-loader.server';
import type { Route } from './+types/ftl';
import { allocated } from './allocated';
import { type FtlAnswer, ftlAction } from './system-action.server';
import {
  ControlSection,
  Gauges,
  SnapshotOffline,
  SystemPage,
} from './system-page';
import { StarSelect } from './star-select';

/**
 * Loads the FTL drive into bridge-api's ship, or sends the submitted form to
 * bridge-api as an FTL spool or jump.
 */
export const action: (args: Route.ActionArgs) => Promise<FtlAnswer> =
  ftlAction();

/**
 * The ship snapshot, which holds the FTL drive's record and its load. It is
 * null when the call fails, and the page shows it offline.
 */
export const loader: (args: Route.LoaderArgs) => Promise<ShipReading | null> =
  snapshotLoader;

/**
 * The drive's status, whether it is armed, its charge in GJ, the power the
 * spool draws, the ship's sector and the tick of the last jump. A ship that
 * has not loaded the drive holds no FTL record, and the gauges read the
 * record the drive loads with.
 */
function FtlGauges({ ship }: { ship: ShipReading }) {
  const { status, charge, sector, jumped } = ship.ftl ?? FTL_RECORD.records.ftl;
  const armed = (ship.setpoints.ftl ?? FTL_RECORD.setpoints.ftl).armed;
  return (
    <ControlSection title="FTL drive">
      <Gauges
        label="FTL gauges"
        gauges={[
          ['Status', status],
          ['Armed', armed ? 'Yes' : 'No'],
          ['Spool charge', `${fixed(charge / 1e9, 1)} GJ`],
          ['Spool power', megawatts(allocated(ship, 'ftl-spool'))],
          ['Sector', sector],
          ['Last jump', jumped === null ? 'none' : `tick ${jumped}`],
        ]}
      />
    </ControlSection>
  );
}

/**
 * The drive section: one button that loads the drive into the ship, and once
 * it has, the spool's draw and the charge a jump spends.
 */
function LoadDrive({ loaded }: { loaded: FtlRating | undefined }) {
  return (
    <ControlSection title="Drive">
      <Form method="post">
        <Button type="submit" name="command" value="load">
          Load drive
        </Button>
      </Form>
      {loaded === undefined ? null : (
        <p role="status">
          {`Drive loaded: the spool draws ${megawatts(loaded.power)}, and a jump spends ${fixed(loaded.energy / 1e9, 1)} GJ.`}
        </p>
      )}
    </ControlSection>
  );
}

export default function Ftl({
  loaderData: ship,
  actionData,
}: Route.ComponentProps) {
  const loaded = actionData?.accepted === 'loaded' ? actionData : undefined;
  const answer = actionData?.accepted === 'loaded' ? undefined : actionData;
  return (
    <SystemPage answer={answer}>
      {ship === null ? <SnapshotOffline /> : <FtlGauges ship={ship} />}
      <LoadDrive loaded={loaded?.rating} />
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
