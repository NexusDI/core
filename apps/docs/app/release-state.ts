import { execFileSync } from 'node:child_process';

import type { Channel } from './channel';

/** The versions the release notice names, read from the release tags. */
export interface ReleaseState {
  /** The newest `@nexusdi/core@x.y.z` tag without a prerelease suffix. */
  stable: string | null;
  /** The newest `@nexusdi/core@x.y.z-rc.n` tag. */
  rc: string | null;
}

const PREFIX = '@nexusdi/core@';
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function parse(version: string) {
  const match = VERSION.exec(version);
  if (!match) throw new Error(`not a semver version: ${version}`);
  const [, major, minor, patch, pre] = match;
  return {
    core: [Number(major), Number(minor), Number(patch)],
    pre: pre ? pre.split('.') : [],
  };
}

function compareIdentifiers(a: string, b: string): number {
  const numeric = /^\d+$/;
  if (numeric.test(a) && numeric.test(b)) return Number(a) - Number(b);
  if (numeric.test(a)) return -1;
  if (numeric.test(b)) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Semver precedence (semver.org §11). Positive when `a` is newer. */
export function compareVersions(a: string, b: string): number {
  const left = parse(a);
  const right = parse(b);

  for (let at = 0; at < 3; at += 1) {
    const delta = (left.core[at] ?? 0) - (right.core[at] ?? 0);
    if (delta !== 0) return delta;
  }

  if (left.pre.length === 0 || right.pre.length === 0) {
    return right.pre.length - left.pre.length;
  }

  for (let at = 0; at < Math.max(left.pre.length, right.pre.length); at += 1) {
    const l = left.pre[at];
    const r = right.pre[at];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const delta = compareIdentifiers(l, r);
    if (delta !== 0) return delta;
  }

  return 0;
}

function tags(cwd: string): string[] {
  try {
    return execFileSync('git', ['tag', '--list', `${PREFIX}*`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith(PREFIX))
      .map((line) => line.slice(PREFIX.length))
      .filter((version) => VERSION.test(version));
  } catch {
    return [];
  }
}

function newest(versions: string[]): string | null {
  return versions.sort(compareVersions).at(-1) ?? null;
}

/**
 * Reads the release tags. The docs workflow checks out with `fetch-depth: 0`
 * so the tags exist; a checkout without them reports no release.
 */
export function readReleaseState(cwd: string): ReleaseState {
  const all = tags(cwd);
  return {
    stable: newest(all.filter((version) => !version.includes('-'))),
    rc: newest(all.filter((version) => /-rc\.\d+$/.test(version))),
  };
}

/** Whether an RC is newer than the newest release: the RC window. */
export function inCandidacy({ stable, rc }: ReleaseState): boolean {
  return rc !== null && (stable === null || compareVersions(rc, stable) > 0);
}

/**
 * The sentence above the H1 of every `/next/` page (spec §5.1). `/next/`
 * builds from the head of release/X.Y, which can be ahead of the newest RC,
 * so the notice names the line and the newest RC on npm. The root build
 * (`release`) carries none.
 */
export function releaseNotice(
  state: ReleaseState,
  channel: Channel,
): string | null {
  if (channel === 'release') return null;

  const { stable, rc } = state;

  if (rc !== null && inCandidacy(state)) {
    const line = rc.split('.').slice(0, 2).join('.');
    const current =
      stable === null
        ? ''
        : ` The documentation for ${stable}, the current release, is at nexus.js.org.`;
    return `This page documents the ${line} release candidates of \`@nexusdi/core\`. The newest on npm is ${rc}.${current}`;
  }

  if (stable !== null) {
    return `This page documents \`@nexusdi/core\` ahead of ${stable}, the current release. The documentation for ${stable} is at nexus.js.org.`;
  }

  return 'This page documents `@nexusdi/core`, which has no release yet.';
}
