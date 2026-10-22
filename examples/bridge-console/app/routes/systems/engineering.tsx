import type { ShipReading } from '@nexusdi/meridian-systems';
import { Form } from 'react-router';

import type { CommandAnswer } from '../../bridge/bridge-link';
import { fixed, megawatts } from '../../bridge/fixed';
import { Button, Section } from '../../components';
import { snapshotLoader } from '../snapshot-loader.server';
import type { Route } from './+types/engineering';
import { systemAction } from './system-action.server';
import { ControlSection, Gauges, SystemPage } from './system-page';

/** Sends the submitted form to bridge-api as an engineering command. */
export const action: (args: Route.ActionArgs) => Promise<CommandAnswer> =
  systemAction('engineering', {
    level: 'number',
    raised: 'boolean',
  });

/** The ship for the gauges, or null when the backend fails. */
export const loader: (args: Route.LoaderArgs) => Promise<ShipReading | null> =
  snapshotLoader;

/** The reactor level, its electric output, the coolant and the shields' power. */
function EngineeringGauges({ ship }: { ship: ShipReading | null }) {
  if (ship === null) return <p>Gauges offline</p>;
  const shields = ship.power.loads.find((load) => load.id === 'shields');
  return (
    <Gauges
      label="Engineering gauges"
      gauges={[
        ['Reactor level', fixed(ship.reactor.level, 2)],
        ['Electric output', megawatts(ship.reactor.electric)],
        ['Coolant', `${fixed(ship.coolant.temperature, 1)} K`],
        ['Shields', megawatts(shields?.allocated ?? 0)],
      ]}
    />
  );
}

export default function Engineering({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <SystemPage answer={actionData}>
      <Section>
        <EngineeringGauges ship={loaderData} />
      </Section>
      <ControlSection title="Reactor">
        <Form method="post" className="flex gap-2 items-center">
          <input type="hidden" name="command" value="throttle" />
          <label htmlFor="level">Throttle</label>
          <input
            id="level"
            name="level"
            type="number"
            min={0}
            max={1}
            step={0.01}
            defaultValue={1}
            required
          />
          <Button type="submit">Set throttle</Button>
        </Form>
      </ControlSection>
      <ControlSection title="Shields">
        <Form method="post" className="flex gap-2">
          <input type="hidden" name="command" value="shields" />
          <Button type="submit" name="raised" value="true">
            Raise shields
          </Button>
          <Button type="submit" name="raised" value="false" variant="outline">
            Lower shields
          </Button>
        </Form>
      </ControlSection>
    </SystemPage>
  );
}
