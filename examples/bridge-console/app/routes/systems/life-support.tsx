import type {
  AtmosphereReading,
  CompartmentId,
  ShipReading,
} from '@nexusdi/meridian-systems';
import { Form } from 'react-router';

import { Button, Section } from '../../components';
import type { CommandAnswer } from '../../di/contracts';
import { fixed, kilopascals } from '../../fixed';
import { useShipReading } from '../../hooks/use-ship-reading';
import type { Route } from './+types/life-support';
import { AirlockControls } from './airlock-controls';
import { COMPARTMENTS } from './compartments';
import {
  lifeSupportLoader,
  type LifeSupportReading,
} from './life-support.server';
import { systemAction } from './system-action.server';
import {
  ControlSection,
  Gauges,
  NumberForm,
  SnapshotOffline,
  SystemPage,
} from './system-page';

/** Sends the submitted form to bridge-api as a life-support command. */
export const action: (args: Route.ActionArgs) => Promise<CommandAnswer> =
  systemAction('life-support', {
    compartment: 'text',
    target: 'number',
    mode: 'text',
    open: 'boolean',
  });

/** The ship snapshot and the four analyzer readings, each null when its call fails. */
export const loader: (args: Route.LoaderArgs) => Promise<LifeSupportReading> =
  lifeSupportLoader;

/**
 * One compartment: the air its gas analyzer reads, and the heater power the
 * ship snapshot records when the compartment has a heater. The analyzer adds
 * its own noise, so its temperature differs from the snapshot's true air.
 */
function Compartment({
  id,
  name,
  reading,
  ship,
}: {
  id: CompartmentId;
  name: string;
  reading: AtmosphereReading<CompartmentId> | null;
  ship: ShipReading | null;
}) {
  const heater = ship?.lifeSupport.heaters[id];
  return (
    <Section aria-label={name}>
      <h2 className="text-2xl font-semibold mb-4 dark:text-white">{name}</h2>
      {reading === null ? (
        <p>Analyzer offline</p>
      ) : (
        <>
          <p>{`Analyzer, tick ${reading.tick}`}</p>
          <Gauges
            label={`${name} analyzer`}
            gauges={[
              ['Temperature', `${fixed(reading.temperature, 1)} K`],
              ['Pressure', kilopascals(reading.pressure, 1)],
              ['O₂ partial pressure', kilopascals(reading.partial.O2, 2)],
              ['CO₂ partial pressure', kilopascals(reading.partial.CO2, 2)],
            ]}
          />
        </>
      )}
      {ship === null || heater === undefined ? null : (
        <>
          <p>{`Ship snapshot, tick ${ship.tick}`}</p>
          <Gauges
            label={`${name} heater`}
            gauges={[['Heater power', `${fixed(heater, 0)} W`]]}
          />
        </>
      )}
    </Section>
  );
}

export default function LifeSupport({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { ship: snapshot, air } = loaderData;
  const ship = useShipReading(snapshot);
  return (
    <SystemPage answer={actionData} ship={ship}>
      {ship === null ? <SnapshotOffline /> : null}
      {COMPARTMENTS.map(([id, name]) => (
        <Compartment
          key={id}
          id={id}
          name={name}
          reading={air[id]}
          ship={ship}
        />
      ))}
      <ControlSection title="Life support">
        <Form method="post">
          <input type="hidden" name="command" value="online" />
          <Button type="submit">Bring life support online</Button>
        </Form>
      </ControlSection>
      <ControlSection title="Habitat thermostat">
        <NumberForm
          command="heater"
          name="target"
          label="Habitat heater target (K)"
          button="Set habitat target"
          min={283}
          max={303}
          step={0.1}
          defaultValue={
            snapshot?.setpoints.lifeSupport.heaters.habitat?.target ?? 293
          }
          hidden={{ compartment: 'habitat' }}
        />
      </ControlSection>
      <ControlSection title="Airlock pump and vent">
        <AirlockControls
          pump={snapshot?.setpoints.lifeSupport.pumps.airlock ?? 'off'}
        />
      </ControlSection>
    </SystemPage>
  );
}

/** The page's error boundary: an action that throws leaves the nav and shows the snapshot offline. */
export { SystemErrorBoundary as ErrorBoundary } from './system-page';
