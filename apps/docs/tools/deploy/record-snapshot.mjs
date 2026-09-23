import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { validateDeployConfig } from './deploy-config.mjs';

/** deploy.json after a docs-snapshot.yml run uploaded revision N. */
export function recordSnapshot(
  config,
  { revision, rootSha256, archiveSha256 },
) {
  if (revision <= config.snapshot.revision) {
    throw new Error(
      `revision ${revision} is not after the recorded revision ${config.snapshot.revision}`,
    );
  }
  const next = {
    ...config,
    snapshot: {
      ...config.snapshot,
      revision,
      assets: {
        root: {
          name: `nexusdi-docs-0.3-root-r${revision}.tar.gz`,
          sha256: rootSha256,
        },
        archive: {
          name: `nexusdi-docs-0.3-archive-r${revision}.tar.gz`,
          sha256: archiveSha256,
        },
      },
    },
  };
  const findings = validateDeployConfig(next);
  if (findings.length > 0) throw new Error(findings.join('\n'));
  return next;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [path, revision, rootSha256, archiveSha256] = process.argv.slice(2);
  const config = JSON.parse(readFileSync(path, 'utf8'));
  const next = recordSnapshot(config, {
    revision: Number(revision),
    rootSha256,
    archiveSha256,
  });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
}
