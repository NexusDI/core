/**
 * The weekly competitor check (spec 4.8, 5.5): for each pin in
 * libraries.json, one issue per newer release on npm, labelled benchmarks,
 * unless an issue with that title exists. Run by benchmarks.yml with
 * GH_TOKEN set.
 */
import { execFileSync } from 'node:child_process';

import { readLibraries } from './libraries.ts';

export interface Pin {
  package: string;
  version: string;
}

/** -1, 0 or 1 for two x.y.z versions; a prerelease sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core = '', pre] = v.split('-', 2);
    return { parts: core.split('.').map(Number), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === undefined) return 1;
  if (y.pre === undefined) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/** The pins whose latest npm version is newer, with the issue title for each. */
export function newerPins(
  pins: readonly Pin[],
  latest: Readonly<Record<string, string>>,
): Array<Pin & { title: string }> {
  return pins.flatMap((pin) => {
    const version = latest[pin.package];
    // An older latest is a registry rollback, not a release.
    if (version === undefined || compareVersions(version, pin.version) <= 0)
      return [];
    return [
      {
        package: pin.package,
        version,
        title: `benchmarks: ${pin.package} ${version} released`,
      },
    ];
  });
}

if (import.meta.main) {
  const pins = readLibraries()
    .libraries.filter((l) => l.id !== 'nexusdi')
    .map((l) => ({ package: l.package, version: l.version }));
  const latest = Object.fromEntries(
    pins.map((p) => [
      p.package,
      execFileSync('npm', ['view', p.package, 'version'], {
        encoding: 'utf8',
      }).trim(),
    ]),
  );
  const repo = process.env.GITHUB_REPOSITORY ?? 'NexusDI/core';
  for (const { title } of newerPins(pins, latest)) {
    const existing = JSON.parse(
      execFileSync(
        'gh',
        [
          'issue',
          'list',
          '--label',
          'benchmarks',
          '--state',
          'all',
          '--search',
          `"${title}" in:title`,
          '--json',
          'title',
        ],
        { encoding: 'utf8' },
      ),
    ) as Array<{ title: string }>;
    if (existing.some((i) => i.title === title)) continue;
    execFileSync(
      'gh',
      [
        'issue',
        'create',
        '--label',
        'benchmarks',
        '--title',
        title,
        '--body',
        `A newer release than the pin in https://github.com/${repo}/blob/main/benchmarks/libraries.json. Re-read the fixture's cited docs at the new version, update the pin and the fixture headers, and let the next benchmark run record the result.`,
      ],
      { stdio: 'inherit' },
    );
  }
}
