import { Form } from 'react-router';

import { BRIDGE_LINK, type CommandAnswer } from '../../bridge/bridge-link';
import { Button, Section } from '../../components';
import { di } from '../../nexus.server';
import type { Route } from './+types/engineering';

/**
 * Sends the submitted form to bridge-api as a ship command. The backend
 * checks the arguments, so a bad level comes back as a refusal.
 */
export const action: (args: Route.ActionArgs) => Promise<CommandAnswer> =
  di.inject(
    { link: BRIDGE_LINK },
    async ({ link }, { request }: Route.ActionArgs) => {
      const form = await request.formData();
      return link.command(
        form.get('command') === 'throttle'
          ? {
              system: 'engineering',
              action: 'throttle',
              level: Number(form.get('level')),
            }
          : {
              system: 'engineering',
              action: 'shields',
              raised: form.get('raised') === 'true',
            },
      );
    },
  );

/** The answer to the last command: its tick, or the refusal and its fix. */
function LastAnswer({ answer }: { answer: CommandAnswer }) {
  if (answer.accepted) return <p>{`Queued for tick ${answer.tick}`}</p>;
  return (
    <div role="alert">
      <p>{answer.message}</p>
      {answer.fix === undefined ? null : <p>{`Fix: ${answer.fix}`}</p>}
    </div>
  );
}

export default function Engineering({ actionData }: Route.ComponentProps) {
  return (
    <>
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
