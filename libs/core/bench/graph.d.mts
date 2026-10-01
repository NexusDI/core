export function makeGraph(
  core: unknown,
  size: 50 | 2000,
): { providers: unknown[]; lookups: unknown[] };

export interface ModularGraphOptions {
  readonly features?: number;
  readonly perFeature?: number;
  readonly exports?: number;
  readonly imports?: number;
}

export function makeModularGraph(
  core: unknown,
  options?: ModularGraphOptions,
): { root: unknown; lookups: unknown[] };
