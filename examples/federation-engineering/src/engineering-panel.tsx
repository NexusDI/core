import { useService } from '@nexusdi/react';
import { useMemo, useSyncExternalStore } from 'react';

import { ENGINE_ROOM } from './engineering-station.module';

/** The reactor, coolant and power gauges, read from the shell's telemetry. */
export function EngineeringPanel() {
  const room = useService(ENGINE_ROOM);
  const telemetry = useSyncExternalStore(room.subscribe, room.state);
  const gauges = useMemo(() => room.gauges(telemetry), [room, telemetry]);
  return (
    <section aria-label="engineering">
      <h2>Engineering</h2>
      {telemetry.status === 'offline' ? (
        <p>Telemetry offline</p>
      ) : telemetry.reading && telemetry.status === 'online' ? (
        <p>Telemetry, tick {telemetry.reading.tick}</p>
      ) : (
        <p>Waiting for telemetry</p>
      )}
      <dl aria-label="Engineering gauges">
        {gauges?.map(([label, text]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
