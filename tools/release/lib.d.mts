export type RefKind = 'main' | 'release' | 'maintenance' | 'other';

export interface NpmPackage {
  name: string;
  versions: string[];
  distTags: Record<string, string>;
}

export interface PlanFacts {
  event: string;
  ref: string;
  mainSha: string;
  dryRun?: boolean;
  tagsAll: string[];
  tagsMergedHead: string[];
  tagsMergedMain: string[];
  remoteTags: string[];
  remoteHeads: string[];
  mainIsAncestor: boolean;
  packages: NpmPackage[];
  release: { relationship: string; pattern: string };
  deployMode: string;
  archiveLines: string[];
  requiredChecks: { context: string; conclusion: string }[];
  proposed: { versions: string[]; current: string } | null;
  releaseExists: boolean;
}

export interface Plan {
  fatal: string | null;
  blockers: string[];
  outputs: Record<string, string>;
}

export const EVENTS: Record<string, RefKind[]>;
export function refKind(ref: string): { kind: RefKind; line?: string };
export function compareVersions(a: string, b: string): number;
export function nextRcVersion(line: string, tags: string[]): string;
export function distTagFor(input: {
  kind: RefKind;
  line?: string;
  version: string;
}): string;
export function planRelease(facts: PlanFacts): Plan;
export function reconcileCommands(input: {
  packages: NpmPackage[];
  version: string;
  distTag: string;
  resume: boolean;
}): { name: string; version: string; tag: string }[];
export function restoreWorkspacePins<T extends object>(
  merged: T,
  ours: object,
  names: string[],
): T;
export function mergeManifests(
  base: object | undefined,
  ours: object,
  theirs: object,
): { result: Record<string, unknown>; conflicts: string[] };
export function changelogSection(text: string, version: string): string | null;
