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
        for (const edge of view.edges) {
          const wanted = markOf(edge.token);
          const had = markOf(byId.get(edge.to)?.token);
          if (wanted === undefined || had === undefined) continue;
          const [wantMajor, wantMinor] = parts(wanted.version);
          const [haveMajor, haveMinor] = parts(had.version);
          if (wantMajor !== haveMajor || wantMinor > haveMinor)
            report(
              contractVersion({
                contract: `${wanted.key}/${wanted.name}`,
                required: wanted.version,
                provided: had.version,
              }),
            );
        }
      },
    },
  };
}
