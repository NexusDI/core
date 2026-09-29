import { NEXUS_PLUGIN_API, type NexusPlugin } from '@nexusdi/core';

import { markOf } from './contract.js';
import { contractVersion } from './contract-version-error.js';

/** The major, minor and patch of a version defineContract accepted. */
function parts(version: string): [number, number, number] {
  const [, major, minor, patch] = /^(\d+)\.(\d+)\.(\d+)/.exec(version) ?? [];
  return [Number(major), Number(minor), Number(patch)];
}

/**
 * Whether a provider at `have` satisfies a dependent built against `want`,
 * as npm's `^want` range does. The majors must match. With the same minor,
 * the dependent's patch must be no newer than the provider's. A newer
 * provider minor satisfies at major 1 and above; at major 0 a minor is a
 * breaking change, so it does not. A prerelease tag is not compared.
 */
function satisfies(want: string, have: string): boolean {
  const [wantMajor, wantMinor, wantPatch] = parts(want);
  const [haveMajor, haveMinor, havePatch] = parts(have);
  if (wantMajor !== haveMajor) return false;
  if (wantMinor !== haveMinor) return wantMajor !== 0 && wantMinor < haveMinor;
  return wantPatch <= havePatch;
}

/**
 * Binds contract tokens by key, and reports a dependent whose contract
 * version the provider's cannot satisfy, as `satisfies` decides. Both
 * versions come from the tokens as written, since the key's canonical
 * token is whichever copy the container met first. Each mismatch is reported
 * once per check.
 */
export function federation(): NexusPlugin {
  return {
    name: 'nexus:federation',
    apiVersion: NEXUS_PLUGIN_API,
    tokenKey: (token) => {
      const mark = markOf(token);
      return mark === undefined ? undefined : `${mark.key}/${mark.name}`;
    },
    compile: {
      check(view, report) {
        const byId = new Map(view.providers.map((p) => [p.id, p]));
        const seen = new Set<string>();
        for (const edge of view.edges) {
          const wanted = markOf(edge.written);
          const had = markOf(byId.get(edge.to)?.written);
          if (wanted === undefined || had === undefined) continue;
          if (satisfies(wanted.version, had.version)) continue;
          const contract = `${wanted.key}/${wanted.name}`;
          const once = `${contract} ${wanted.version} ${had.version}`;
          if (seen.has(once)) continue;
          seen.add(once);
          report(
            contractVersion({
              contract,
              required: wanted.version,
              provided: had.version,
            }),
          );
        }
      },
    },
  };
}
