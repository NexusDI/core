import type {
  AtmosphereReading,
  CompartmentId,
  ShipReading,
} from '@nexusdi/meridian-systems';
import { Form } from 'react-router';

import { BRIDGE_LINK, type CommandAnswer } from '../../bridge/bridge-link';
import { fixed, kilopascals } from '../../bridge/fixed';
import { Button, Section } from '../../components';
import { di } from '../../nexus.server';
import type { Route } from './+types/life-support';
import { AirlockControls } from './airlock-controls';
import { COMPARTMENTS } from './compartments';
import { systemAction } from './system-action.server';
import {
  ControlSection,
  Gauges,
  SnapshotOffline,
  SystemPage,
} from './system-page';

/**
 * What the page reads: the ship snapshot and each compartment's analyzer
 * reading, each null when its call fails.
 */
export interface LifeSupportReading {
  readonly ship: ShipReading | null;
  readonly air: Readonly<
    Record<CompartmentId, AtmosphereReading<CompartmentId> | null>
  >;
}

/** Sends the submitted form to bridge-api as a life-support command. */
export const action: (args: Route.ActionArgs) => Promise<CommandAnswer> =
  systemAction('life-support', {
    compartment: 'text',
    target: 'number',
    mode: 'text',
    open: 'boolean',
  });

/**
 * The snapshot and the four analyzer reads, all in flight at once. A call
 * that fails leaves its part null, and the page shows that part offline.
 */
export const loader: (args: Route.LoaderArgs) => Promise<LifeSupportReading> =
  di.inject({ link: BRIDGE_LINK }, async ({ link }) => {
    const ship = link.snapshot().catch(() => null);
    const reads = Promise.all(
      COMPARTMENTS.map(
        async ([id]) =>
          [id, await link.atmosphere(id).catch(() => null)] as const,
      ),
    );
    return {
      ship: await ship,
      air: Object.fromEntries(await reads) as LifeSupportReading['air'],
    };
  });

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
  const { ship, air } = loaderData;
  return (
    <SystemPage answer={actionData}>
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
        <Form method="post" className="flex gap-2 items-center">
          <input type="hidden" name="command" value="heater" />
          <input type="hidden" name="compartment" value="habitat" />
          <label htmlFor="target">Habitat heater target (K)</label>
          <input
            id="target"
            name="target"
            type="number"
            min={283}
            max={303}
            step={0.1}
            defaultValue={293}
            required
          />
          <Button type="submit">Set habitat target</Button>
        </Form>
      </ControlSection>
      <ControlSection title="Airlock pump and vent">
        <AirlockControls />
      </ControlSection>
    </SystemPage>
  );
}
