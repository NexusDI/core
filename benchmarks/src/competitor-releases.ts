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

/**
 * -1, 0 or 1 for two x.y.z versions. A prerelease sorts before its
 * release, and prerelease identifiers compare as semver says: numbers by
 * value and below words, so rc.10 follows rc.9.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const at = v.indexOf('-');
    const core = at === -1 ? v : v.slice(0, at);
    const pre = at === -1 ? undefined : v.slice(at + 1).split('.');
    return { parts: core.split('.').map(Number), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  if (x.pre === undefined || y.pre === undefined)
    return x.pre === y.pre ? 0 : x.pre === undefined ? 1 : -1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const d = compareIdentifiers(p, q);
    if (d !== 0) return d;
  }
  return 0;
}

const NUMERIC = /^\d+$/;

/** One prerelease identifier against another: numbers by value, numbers before words. */
function compareIdentifiers(p: string, q: string): number {
  const pn = NUMERIC.test(p);
  const qn = NUMERIC.test(q);
  if (pn && qn) return Math.sign(Number(p) - Number(q));
  if (pn !== qn) return pn ? -1 : 1;
  if (p === q) return 0;
  return p < q ? -1 : 1;
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
