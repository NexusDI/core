import { useService } from '@nexusdi/react';
import type { CommandReceipt } from '@nexusdi/federation-contracts';
import { useMemo, useState, useSyncExternalStore } from 'react';

import {
  ATMOSPHERE_DESK,
  type IAtmosphereDesk,
} from './life-support-station.module';

const HABITAT = 'habitat';

/** The five habitat orders, each a button label and the desk call behind it. */
const ORDERS: readonly (readonly [
  label: string,
  run: (desk: IAtmosphereDesk) => Promise<CommandReceipt>,
])[] = [
  ['Bring life support online', (desk) => desk.online()],
  ['Stop the habitat scrubber', (desk) => desk.scrubber(HABITAT, false)],
  ['Run the habitat scrubber', (desk) => desk.scrubber(HABITAT, true)],
  ['Stop the habitat oxygen generator', (desk) => desk.oxygen(HABITAT, false)],
  ['Run the habitat oxygen generator', (desk) => desk.oxygen(HABITAT, true)],
];

/** The compartment air from the shell's telemetry, and the habitat's atmosphere commands. */
export function LifeSupportPanel() {
  const desk = useService(ATMOSPHERE_DESK);
  const telemetry = useSyncExternalStore(desk.subscribe, desk.state);
  const rows = useMemo(() => desk.compartments(telemetry), [desk, telemetry]);
  const [receipt, setReceipt] = useState<CommandReceipt | null>(null);
  const labels = rows?.[0]?.gauges.map(([label]) => label) ?? [];
  return (
    <section aria-label="life support">
      <h2>Life support</h2>
      {telemetry.status === 'offline' ? (
        <p>Telemetry offline</p>
      ) : telemetry.reading && telemetry.status === 'online' ? (
        <p>Telemetry, tick {telemetry.reading.tick}</p>
      ) : (
        <p>Waiting for telemetry</p>
      )}
      <table aria-label="Compartment air">
        <thead>
          <tr>
            <th scope="col">Compartment</th>
            {labels.map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows?.map(({ id, gauges }) => (
            <tr key={id}>
              <th scope="row">{id}</th>
              {gauges.map(([label, text]) => (
                <td key={label}>{text}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        {ORDERS.map(([label, run]) => (
          <button
            key={label}
            type="button"
            onClick={() => void run(desk).then(setReceipt)}
          >
            {label}
          </button>
        ))}
      </div>
      <p role="status">{receipt?.text}</p>
    </section>
  );
}
