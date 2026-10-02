import type { LibraryId, Variant } from '../../tools/benchmark-data.mjs';

import { benchmarkData as data } from './data';
import { Detail } from './Detail';
import { LIBRARY_NAMES, OUTCOME_LABELS } from './format';
import { Frame } from './Frame';

/**
 * `matrix.json` as a table: one row per library and variant, one column per
 * toolchain cell. A cell that does not pass carries its first error line and
 * the page that documents the limitation.
 */
export function ToolchainGrid({
  library,
  variant,
}: {
  library?: LibraryId;
  variant?: Variant;
}) {
  const toolchains = Object.keys(data.sources.matrix.versions.toolchains);
  const rows = (Object.keys(data.matrix) as LibraryId[])
    .filter((id) => library === undefined || id === library)
    .flatMap((id) =>
      (Object.keys(data.matrix[id] ?? {}) as Variant[])
        .filter((each) => variant === undefined || each === variant)
        .map((each) => [id, each] as const),
    );
  return (
    <Frame label="Toolchain matrix">
      <table className="nexus-bench__table nexus-bench__table--grid">
        <caption>
          The outcome of Meridian-8 for each library and variant under each
          toolchain, with @nexusdi/core {data.sources.matrix.versions.core}.
        </caption>
        <thead>
          <tr>
            <th scope="col">Library and variant</th>
            {toolchains.map((toolchain) => (
              <th scope="col" key={toolchain}>
                {toolchain}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, each]) => (
            <tr key={`${id}-${each}`}>
              <th scope="row">
                {LIBRARY_NAMES[id]}{' '}
                <span className="nexus-bench__variant">{each}</span>
              </th>
              {toolchains.map((toolchain) => {
                const cell = data.matrix[id]?.[each]?.[toolchain];
                if (cell === undefined)
                  return <td key={toolchain}>not measured</td>;
                const lines = [cell.message, cell.note].filter(
                  (line): line is string => line !== undefined,
                );
                return (
                  <td
                    key={toolchain}
                    className={`nexus-bench__outcome--${cell.outcome}`}
                  >
                    <Detail
                      id={`grid-${id}-${each}-${toolchain}`}
                      lines={lines}
                    >
                      {OUTCOME_LABELS[cell.outcome]}
                    </Detail>
                    {cell.documented === undefined ? null : (
                      <>
                        {' '}
                        <a href={cell.documented}>documented</a>
                      </>
                    )}
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
