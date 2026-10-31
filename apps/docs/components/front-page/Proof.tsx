import type { ReactNode } from 'react';
import { execFileSync } from 'node:child_process';
import Link from 'next/link';

import { benchmarkData as data } from '../benchmarks/data';
import { libraryEntries, LIBRARY_NAMES } from '../benchmarks/format';
import {
  dependencyCount,
  workspacePackages,
} from '../../tools/package-facts.mjs';
import { workspaceRoot } from './facts';

/**
 * One readout of the proof section (site UX spec 4.9): the figure in
 * `readout` type, its unit in `micro`, one sentence on where it comes from,
 * and a link. The figure arrives as a child, so a page's `<Figure of>` stays
 * in the MDX where `doc-benchmark-figures` reads it.
 */
export function Readout({
  unit,
  href,
  link,
  children,
}: {
  unit: string;
  href: string;
  link: string;
  children: ReactNode;
}) {
  return (
    <div className="nexus-readout">
      <p className="nexus-readout__value">
        {children}
        <span className="nexus-readout__unit">{unit}</span>
      </p>
      <p className="nexus-readout__note">
        <Link href={href}>{link}</Link>
      </p>
    </div>
  );
}

/** The two readouts side by side, and one under the other on a phone. */
export function Readouts({ children }: { children: ReactNode }) {
  return <div className="nexus-readouts">{children}</div>;
}

/** The runtime dependency count of `@nexusdi/core`, read from its package file at build time. */
export function DependencyCount() {
  const count = dependencyCount(workspaceRoot());
  return <data value={String(count)}>{count}</data>;
}

/** The two cold-start readings of the startup row and the run they came from. */
export function StartupRow({
  run,
  children,
}: {
  run: string;
  children: ReactNode;
}) {
  const source = data.sources.timings[run];
  if (source === undefined) {
    throw new Error(
      `<StartupRow run="${run}">: benchmarks/results/timings/ holds no such file.`,
    );
  }
  const date = source.startedAt?.slice(0, 10);
  return (
    <div className="nexus-startup">
      <div className="nexus-startup__cells">{children}</div>
      <p className="nexus-startup__meta">
        Run <code>{run}</code>
        {date ? `, dated ${date}` : ''}. A fresh Node process loads the library
        and resolves the eight-provider app, which builds every singleton.
      </p>
    </div>
  );
}

/** One library's cold-start figure in the startup row. */
export function StartupCell({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <p className="nexus-startup__cell">
      <span className="nexus-startup__name">{name}</span>
      <span className="nexus-startup__value">{children}</span>
      <span className="nexus-startup__unit">cold start</span>
    </p>
  );
}

function commitDate(sha: string | null): string | null {
  if (sha === null) return null;
  try {
    return execFileSync('git', ['show', '-s', '--format=%cs', sha], {
      cwd: workspaceRoot(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The footnote of the probe table: the versions the probes ran against and
 * the date of the commit that holds `probes.json`.
 */
export function ProbeNote() {
  const { commit, versions } = data.sources.probes;
  const date = commitDate(commit);
  const measured = libraryEntries(data)
    .map(([id]) => `${LIBRARY_NAMES[id]} ${versions.libraries[id]}`)
    .join(', ');
  return (
    <p className="nexus-note">
      The probes ran on Node {versions.node} against {measured}
      {date ? `, committed ${date}` : ''}. Each library runs in the variant its
      own documentation teaches.
    </p>
  );
}

/**
 * The package list of the install section (site UX spec 4.10), read from the
 * workspace at build time: `@nexusdi/core` first and marked as the one a
 * reader needs, then each other package with its description and its npm and
 * docs links.
 */
export function PackageList() {
  const packages = workspacePackages(workspaceRoot());
  return (
    <ul className="nexus-packages">
      {packages.map((pkg) => (
        <li
          key={pkg.name}
          className={
            pkg.required
              ? 'nexus-packages__item nexus-packages__item--core'
              : 'nexus-packages__item'
          }
        >
          <code>{pkg.name}</code>
          {pkg.required ? (
            <span className="nexus-packages__need">The one you need</span>
          ) : null}
          <span className="nexus-packages__links">
            <a href={pkg.npm}>
              npm
              <span className="nexus-visually-hidden"> page of {pkg.name}</span>
            </a>
            {pkg.docs ? (
              <Link href={pkg.docs}>
                docs
                <span className="nexus-visually-hidden"> for {pkg.name}</span>
              </Link>
            ) : null}
          </span>
          <span className="nexus-packages__line">{pkg.description}</span>
        </li>
      ))}
    </ul>
  );
}
