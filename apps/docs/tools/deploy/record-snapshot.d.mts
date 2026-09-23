import type { DeployConfig } from './deploy-config.d.mts';

export function recordSnapshot(
  config: DeployConfig,
  input: { revision: number; rootSha256: string; archiveSha256: string },
): DeployConfig;
