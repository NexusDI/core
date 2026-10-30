import type { ShipReading } from '@nexusdi/meridian-systems';

import { Section } from '../../components';
import type { CommandAnswer } from '../../di/contracts';
import { fixed, megawatts } from '../../fixed';
import { snapshotLoader } from '../snapshot-loader.server';
import type { Route } from './+types/engineering';
import { allocated } from './allocated';
import { systemAction } from './system-action.server';
import {
  ControlSection,
  Gauges,
  LevelForm,
  LiveSystemPage,
  ToggleForm,
} from './system-page';

/** The page's error boundary: an action that throws leaves the nav and shows the snapshot offline. */
export { SystemErrorBoundary as ErrorBoundary } from './system-page';

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
function EngineeringGauges({ ship }: { ship: ShipReading }) {
  return (
    <Section>
      <Gauges
        label="Engineering gauges"
        gauges={[
          ['Reactor level', fixed(ship.reactor.level, 2)],
          ['Electric output', megawatts(ship.reactor.electric)],
          ['Coolant', `${fixed(ship.coolant.temperature, 1)} K`],
          ['Shields', megawatts(allocated(ship, 'shields'))],
        ]}
      />
    </Section>
  );
}

export default function Engineering({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <LiveSystemPage
      snapshot={loaderData}
      answer={actionData}
      gauges={(ship) => <EngineeringGauges ship={ship} />}
    >
      <ControlSection title="Reactor">
        <LevelForm
          command="throttle"
          label="Throttle"
          button="Set throttle"
          defaultValue={loaderData?.setpoints.reactor.throttle ?? 1}
        />
      </ControlSection>
      <ControlSection title="Shields">
        <ToggleForm
          command="shields"
          field="raised"
          on="Raise shields"
          off="Lower shields"
        />
      </ControlSection>
    </LiveSystemPage>
  );
}
