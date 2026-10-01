import Link from 'next/link';

import type {
  LibraryId,
  PairedRatio,
  Scenario,
  Stats,
  Variant,
} from '../../tools/benchmark-data.mjs';

import { benchmarkData as data } from './data';
import { Detail } from './Detail';
import {
  formatBytes,
  formatDuration,
  formatRatio,
  LIBRARY_NAMES,
  libraryEntries,
  OUTCOME_LABELS,
  polyfillLabel,
} from './format';
import { Frame } from './Frame';

type Cell =
  { text: string; lines: string[]; noisy: boolean } | { missing: string };

function spread(stats: Stats, toNs: number): string[] {
  return [
    `MAD ${formatDuration(stats.mad * toNs)}`,
    `p5 ${formatDuration(stats.p5 * toNs)}`,
    `p95 ${formatDuration(stats.p95 * toNs)}`,
  ];
}

function ratio(vsNexus: PairedRatio | undefined): string[] {
  return vsNexus === undefined ? [] : [formatRatio(vsNexus)];
}

/** Why a timing has no record: the library's own reason, or the matrix outcome. */
function reason(
  library: LibraryId,
  variant: Variant,
  section: 'singleton' | 'transient',
  scenario: Scenario,
): string {
  const stated =
    section === 'singleton'
      ? undefined
      : data.libraries[library]?.notApplicable[section];
  if (stated !== undefined) return stated;
  const outcome = data.matrix[library]?.[variant]?.['tsc']?.sections[section];
  if (outcome !== undefined && outcome !== 'pass')
    return `the tsc build's ${section} section is a ${OUTCOME_LABELS[outcome]}`;
  return `the timings run holds no ${scenario} record`;
}

function sizeCell(library: LibraryId, variant: Variant): Cell {
  const row = data.size[library]?.[variant]?.esbuild;
  if (row === undefined)
    return { missing: 'size.json holds no esbuild bundle' };
  const polyfill = polyfillLabel(data.libraries[library]?.polyfill ?? null);
  return {
    text: formatBytes(row.gzip),
    noisy: false,
    lines: [
      `minified ${formatBytes(row.minified)}`,
      ...(polyfill !== null && row.polyfillGzip > 0
        ? [`${polyfill} ${formatBytes(row.polyfillGzip)} of it`]
        : []),
      ...(row.runs === 'pass'
        ? []
        : [`the minified bundle's run: ${OUTCOME_LABELS[row.runs]}`]),
    ],
  };
}

function timingCell(
  run: string,
  library: LibraryId,
  variant: Variant,
  scenario: Scenario,
  section: 'singleton' | 'transient',
): Cell {
  const record = data.timings[run]?.[library]?.[variant]?.[scenario];
  if (record === undefined)
    return { missing: reason(library, variant, section, scenario) };
  const ready = data.timings[run]?.[library]?.[variant]?.ready;
  return {
    text: formatDuration(record.median),
    noisy: record.noisy,
    lines: [
      ...spread(record, 1),
      ...(scenario === 'cold-start' && ready !== undefined
        ? [`ready ${formatDuration(ready.median)}`]
        : []),
      ...ratio(record.vsNexus),
    ],
  };
}

function buildCell(library: LibraryId): Cell {
  const headline = data.build.headline[library];
  const cell =
    headline === undefined
      ? undefined
      : data.build[library]?.[headline.variant]?.[headline.toolchain];
  if (headline === undefined || cell === undefined)
    return {
      missing: 'no build passes under a toolchain its documentation names',
    };
  return {
    text: `${formatDuration(cell.median * 1e6)} (${headline.toolchain})`,
    noisy: cell.noisy,
    lines: [...spread(cell, 1e6), ...ratio(headline.vsNexus)],
  };
}

function Value({ id, cell }: { id: string; cell: Cell }) {
  if ('missing' in cell)
    return (
      <span className="nexus-bench__missing">not measured: {cell.missing}</span>
    );
  return (
    <Detail id={id} lines={cell.lines}>
      <span className="nexus-bench__figure">{cell.text}</span>
      {cell.noisy ? <span className="nexus-bench__noisy">noisy</span> : null}
    </Detail>
  );
}

const COLUMNS = [
  'Bundle size (min+gzip)',
  'Startup',
  'Resolve',
  'Build time',
] as const;

/**
 * Benchmarks spec §5.6: one row per library in its documented variant.
 * Bundle size is esbuild's, startup the cold start, resolve a transient
 * resolve, and build the library's headline `scale-200` cell.
 */
export function PerformanceTable({
  libraries,
  run = data.newest,
}: {
  libraries?: LibraryId[];
  run?: string;
}) {
  const source = data.sources.timings[run];
  if (source === undefined)
    throw new Error(
      `<PerformanceTable run="${run}">: benchmarks/results/timings/ holds no such file.`,
    );
  const rows = libraryEntries(data).filter(
    ([id]) => libraries === undefined || libraries.includes(id),
  );
  return (
    <Frame label="Performance comparison">
      <table className="nexus-bench__table">
        <caption>
          Timings run {run} on {source.runner?.cpu}, with @nexusdi/core{' '}
          {source.versions.core}. Each figure is a median; focus or hover it for
          the spread.{' '}
          <Link href="/benchmark-method/">How the benchmarks are measured</Link>
        </caption>
        <thead>
          <tr>
            <th scope="col">Library</th>
            {COLUMNS.map((column) => (
              <th scope="col" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, facts]) => {
            const variant = facts.documented;
            const cells = [
              sizeCell(id, variant),
              timingCell(run, id, variant, 'cold-start', 'singleton'),
              timingCell(run, id, variant, 'resolve-transient', 'transient'),
              buildCell(id),
            ];
            return (
              <tr key={id}>
                <th scope="row">
                  {LIBRARY_NAMES[id]}{' '}
                  <span className="nexus-bench__variant">{variant}</span>
                </th>
                {cells.map((cell, at) => (
                  <td key={COLUMNS[at]}>
                    <Value id={`performance-${id}-${at}`} cell={cell} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Frame>
  );
}
