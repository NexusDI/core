import { NEXUS_PLUGIN_API, type NexusPlugin } from '@nexusdi/core';

import { markOf } from './contract.js';
import { contractVersion } from './contract-version-error.js';

function parts(version: string): [number, number] {
  const [major = 'NaN', minor = 'NaN'] = version.split('.');
  return [Number(major), Number(minor)];
}

/**
 * Binds contract tokens by key, and reports a dependent whose contract
 * version the provider's cannot satisfy: another major, or a newer minor.
 * Both versions come from the tokens as written, since the key's canonical
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
          const [wantMajor, wantMinor] = parts(wanted.version);
          const [haveMajor, haveMinor] = parts(had.version);
          if (wantMajor === haveMajor && wantMinor <= haveMinor) continue;
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
