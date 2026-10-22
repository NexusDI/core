import type { ShipReading } from '@nexusdi/meridian-systems';
import { Form } from 'react-router';

import { BRIDGE_LINK, type CommandAnswer } from '../../bridge/bridge-link';
import { Button, Section } from '../../components';
import { di } from '../../nexus.server';
import type { Route } from './+types/engineering';

/**
 * Sends the submitted form to bridge-api as a ship command. The form's
 * `command` names the action, and an argument the form leaves blank stays
 * out of the command. The backend checks both, so a bad command comes back
 * as a refusal.
 */
export const action: (args: Route.ActionArgs) => Promise<CommandAnswer> =
  di.inject(
    { link: BRIDGE_LINK },
    async ({ link }, { request }: Route.ActionArgs) => {
      const form = await request.formData();
      const level = form.get('level');
      const raised = form.get('raised');
      return link.command({
        system: 'engineering',
        action: String(form.get('command') ?? ''),
        ...(typeof level === 'string' && level !== ''
          ? { level: Number(level) }
          : {}),
        ...(raised === 'true' || raised === 'false'
          ? { raised: raised === 'true' }
          : {}),
      });
    },
  );

/** The ship for the gauges, or null when the backend fails. */
export const loader: (args: Route.LoaderArgs) => Promise<ShipReading | null> =
  di.inject({ link: BRIDGE_LINK }, ({ link }) =>
    link.snapshot().catch(() => null),
  );

const megawatts = (watts: number) => `${watts / 1e6} MW`;

/** The reactor level, its electric output, the coolant and the shields' power. */
function Gauges({ ship }: { ship: ShipReading | null }) {
  if (ship === null) return <p>Gauges offline</p>;
  const shields = ship.power.loads.find((load) => load.id === 'shields');
  const gauges = [
    ['Reactor level', String(ship.reactor.level)],
    ['Electric output', megawatts(ship.reactor.electric)],
    ['Coolant', `${ship.coolant.temperature} K`],
    ['Shields', megawatts(shields?.allocated ?? 0)],
  ];
  return (
    <dl aria-label="Engineering gauges" className="grid grid-cols-2 gap-1">
      {gauges.map(([name, value]) => (
        <div key={name} className="contents">
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The answer to the last command: its tick, or the refusal and its fix. */
function LastAnswer({ answer }: { answer: CommandAnswer }) {
  if (answer.accepted)
    return <p role="status">{`Queued for tick ${answer.tick}`}</p>;
  return (
    <div role="alert">
      <p>{answer.message}</p>
      {answer.fix === undefined ? null : <p>{`Fix: ${answer.fix}`}</p>}
    </div>
  );
}

export default function Engineering({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <>
      <Section>
        <Gauges ship={loaderData} />
      </Section>
      <Section>
        <h2 className="text-2xl font-semibold mb-4 dark:text-white">Reactor</h2>
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
      </Section>
      <Section>
        <h2 className="text-2xl font-semibold mb-4 dark:text-white">Shields</h2>
        <Form method="post" className="flex gap-2">
          <input type="hidden" name="command" value="shields" />
          <Button type="submit" name="raised" value="true">
            Raise shields
          </Button>
          <Button type="submit" name="raised" value="false" variant="outline">
            Lower shields
          </Button>
        </Form>
      </Section>
      {actionData === undefined ? null : (
        <Section>
          <LastAnswer answer={actionData} />
        </Section>
      )}
    </>
  );
}
