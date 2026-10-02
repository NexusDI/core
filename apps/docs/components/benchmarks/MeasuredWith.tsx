import type { ResultsSource } from '../../tools/benchmark-data.mjs';

import { benchmarkData as data } from './data';
import { LIBRARY_NAMES, libraryEntries, polyfillLabel } from './format';
import { Frame } from './Frame';

const REPOSITORY = 'https://github.com/NexusDI/core';

function FileLink({ source }: { source: ResultsSource }) {
  const name = source.path.replace('benchmarks/results/', '');
  if (source.commit === null) return <code>{name}</code>;
  return (
    <a href={`${REPOSITORY}/blob/${source.commit}/${source.path}`}>
      <code>{name}</code> at {source.commit.slice(0, 7)}
    </a>
  );
}

/** The versions and the runner, with a link to each results file at its commit (benchmarks spec §4.12). */
export function MeasuredWith({ run = data.newest }: { run?: string }) {
  const timings = data.sources.timings[run];
  if (timings === undefined)
    throw new Error(
      `<MeasuredWith run="${run}">: benchmarks/results/timings/ holds no such file.`,
    );
  const { versions, runner } = timings;
  const toolchains: Record<string, string> = versions.toolchains;
  const bundlers = data.sources.size.versions.bundlers;
  return (
    <Frame label="Measured with">
      <dl className="nexus-bench__facts">
        <dt>Libraries</dt>
        <dd>
          {libraryEntries(data).map(([id, facts]) => {
            const polyfill = polyfillLabel(facts.polyfill);
            return (
              <span key={id}>
                {LIBRARY_NAMES[id]} {versions.libraries[id]}
                {polyfill === null ? '' : ` with a ${polyfill}`}
              </span>
            );
          })}
        </dd>
        <dt>Toolchains</dt>
        <dd>
          {Object.entries(toolchains).map(([cell, version]) => (
            <span key={cell}>
              {cell} {version}
            </span>
          ))}
          {bundlers === undefined ? null : (
            <span>
              bundlers: esbuild {bundlers.esbuild}, rollup {bundlers.rollup}
            </span>
          )}
        </dd>
        <dt>Runtime</dt>
        <dd>Node {versions.node}</dd>
        <dt>Runner</dt>
        <dd>
          {runner?.cpu}, {runner?.cores} cores, {runner?.memoryGb} GB,{' '}
          {runner?.os}, {runner?.hosted ? 'GitHub-hosted' : 'self-hosted'}
        </dd>
        <dt>Timings run</dt>
        <dd>
          {timings.startedAt?.slice(0, 10)}, seed {timings.seed}, core commit{' '}
          {timings.sha}
        </dd>
        <dt>Results files</dt>
        <dd>
          {[
            data.sources.matrix,
            data.sources.probes,
            data.sources.size,
            data.sources.build,
            timings,
          ].map((source) => (
            <span key={source.path}>
              <FileLink source={source} />
            </span>
          ))}
        </dd>
      </dl>
    </Frame>
  );
}
