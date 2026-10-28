import type { ShipReading } from '@nexusdi/meridian-systems';
import { Form } from 'react-router';

import { Button } from '../../components';
import type { CommandAnswer } from '../../di/contracts';
import { megawatts } from '../../fixed';
import { snapshotLoader } from '../snapshot-loader.server';
import type { Route } from './+types/comms';
import { allocated } from './allocated';
import { systemAction } from './system-action.server';
import {
  ControlSection,
  Gauges,
  ItemList,
  SnapshotOffline,
  SystemPage,
} from './system-page';

/** Sends the submitted form to bridge-api as a comms command. */
export const action: (args: Route.ActionArgs) => Promise<CommandAnswer> =
  systemAction('comms', {});

/**
 * The ship snapshot, which holds the phased array's record and its load. It
 * is null when the call fails, and the page shows it offline.
 */
export const loader: (args: Route.LoaderArgs) => Promise<ShipReading | null> =
  snapshotLoader;

/** The array's status, hail flag, last send and power, then the messages it received. */
function CommsGauges({ ship }: { ship: ShipReading }) {
  const { status, sent, messages } = ship.comms;
  return (
    <>
      <ControlSection title="Comms">
        <Gauges
          label="Comms gauges"
          gauges={[
            ['Status', status],
            ['Hail queued', ship.setpoints.comms.hail ? 'Yes' : 'No'],
            ['Last hail sent', sent === null ? 'none' : `tick ${sent}`],
            ['Array power', megawatts(allocated(ship, 'comms'))],
          ]}
        />
      </ControlSection>
      <ControlSection title="Messages">
        <ItemList
          label="Messages"
          none="No messages"
          items={messages.map(
            ({ tick, from, text }) => `${from}: ${text} (tick ${tick})`,
          )}
        />
      </ControlSection>
    </>
  );
}

export default function Comms({
  loaderData: ship,
  actionData,
}: Route.ComponentProps) {
  return (
    <SystemPage answer={actionData}>
      {ship === null ? <SnapshotOffline /> : <CommsGauges ship={ship} />}
      <ControlSection title="Hail">
        <Form method="post">
          <Button type="submit" name="command" value="hail">
            Hail fleet traffic control
          </Button>
        </Form>
      </ControlSection>
    </SystemPage>
  );
}
