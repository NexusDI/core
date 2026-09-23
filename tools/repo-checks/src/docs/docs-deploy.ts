import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DOCS } from './paths';

/**
 * `docs-deploy` (spec §14.3): deploy.json matches its schema, a root re-cut
 * descends from the release tag, and the /v0.3/ retention of §15.7 retires
 * the archive on time. It replaces the libraries `docs-archive` guard: this
 * site keeps one archive before 1.0, so the retention check is the whole job.
 */
export interface DeployContext {
  today: Date;
  newestStableTag: string | null;
  v050Date: string | null;
  isAncestor(ancestor: string, descendant: string): boolean;
}

type ValidateDeployConfig = (config: unknown) => string[];
type RetentionEnded = (input: {
  finalDate: string | null;
  v050Date: string | null;
  today: Date;
}) => boolean;

// The docs app owns the validator and the retention rule, and docs.yml runs
// the validator's CLI from there. A computed dynamic import loads both
// modules without a static import, so Nx records no
// @nexusdi/repo-checks -> @nexusdi/docs dependency and tsc never compiles the
// docs app's files into this project.
const { validateDeployConfig } = (await import(
  pathToFileURL(join(DOCS, 'tools/deploy/deploy-config.mjs')).href
)) as { validateDeployConfig: ValidateDeployConfig };
const { retentionEnded } = (await import(
  pathToFileURL(join(DOCS, 'tools/deploy/retention.mjs')).href
)) as { retentionEnded: RetentionEnded };

const FILE = 'apps/docs/deploy.json';

export function checkDeploy(config: unknown, context: DeployContext): string[] {
  const schema = validateDeployConfig(config);
  if (schema.length > 0) return schema.map((finding) => `${FILE}: ${finding}`);

  const valid = config as {
    mode: string;
    root: { sha: string | null };
    finalDate: string | null;
  };
  const findings: string[] = [];

  if (
    valid.mode === 'final' &&
    retentionEnded({
      finalDate: valid.finalDate,
      v050Date: context.v050Date,
      today: context.today,
    })
  ) {
    findings.push(
      `${FILE}: the /v0.3/ retention ended (six months after ${valid.finalDate}, and @nexusdi/core@0.5.0 is tagged). Set mode to "retired".`,
    );
  }

  const sha = valid.root.sha;
  if (sha !== null) {
    if (context.newestStableTag === null) {
      findings.push(
        `${FILE}: root.sha is set, and no stable @nexusdi/core tag exists to re-cut from.`,
      );
    } else if (!context.isAncestor(context.newestStableTag, sha)) {
      findings.push(
        `${FILE}: root.sha ${sha} does not descend from ${context.newestStableTag}. A re-cut builds from a commit after the release tag.`,
      );
    }
  }

  return findings;
}
