import type { LibraryId, Probe } from '../../tools/benchmark-data.mjs';

import { benchmarkData as data } from './data';
import { Detail } from './Detail';
import {
  DETECTED_LABELS,
  LIBRARY_NAMES,
  libraryEntries,
  PROBE_LABELS,
} from './format';
import { Frame } from './Frame';

/**
 * `probes.json`: where each library reports each wiring mistake, in its
 * documented variant. `library` keeps one library beside NexusDI, and `probes`
 * limits the rows to the probes it names, in the order it names them.
 */
export function ProbeTable({
  library,
  probes: only,
}: {
  library?: LibraryId;
  probes?: readonly Probe[];
}) {
  const columns = libraryEntries(data).filter(
    ([id]) => library === undefined || id === library || id === 'nexusdi',
  );
  const probes = only ?? (Object.keys(PROBE_LABELS) as Probe[]);
  return (
    <Frame label="Wiring-mistake probes">
      <table className="nexus-bench__table">
        <caption>
          When each library reports a wiring mistake in Meridian-8, with
          @nexusdi/core {data.sources.probes.versions.core}.
        </caption>
        <thead>
          <tr>
            <th scope="col">Mistake</th>
            {columns.map(([id]) => (
              <th scope="col" key={id}>
                {LIBRARY_NAMES[id]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {probes.map((probe) => (
            <tr key={probe}>
              <th scope="row">{PROBE_LABELS[probe]}</th>
              {columns.map(([id, facts]) => {
                const row = data.probes[id]?.[facts.documented]?.[probe];
                if (row === undefined) return <td key={id}>not measured</td>;
                const reported =
                  row.reported === undefined
                    ? ''
                    : `, names ${row.reported} of 2`;
                return (
                  <td
                    key={id}
                    className={`nexus-bench__detected--${row.detectedAt}`}
                  >
                    <Detail
                      id={`probe-${id}-${probe}`}
                      lines={row.message === undefined ? [] : [row.message]}
                    >
                      {DETECTED_LABELS[row.detectedAt]}
                      {reported}
                    </Detail>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Frame>
  );
}
