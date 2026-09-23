export type DeployMode = 'snapshot-only' | 'rc' | 'final' | 'retired';

export interface SnapshotAsset {
  name: string;
  sha256: string;
}

export interface DeployConfig {
  mode: DeployMode;
  root: { tag: string | null; sha: string | null; reason: string | null };
  snapshot: {
    release: 'docs-snapshot-0.3';
    source: string;
    revision: number;
    assets: { root: SnapshotAsset; archive: SnapshotAsset } | null;
  };
  finalDate: string | null;
}

export const MODES: readonly DeployMode[];
export function validateDeployConfig(config: unknown): string[];
export function readDeployConfig(path: string): DeployConfig;
export function outputsFor(config: DeployConfig): Record<string, string>;
