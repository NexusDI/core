/**
 * The dotted results paths of spec 4.9, `<family>.<keys>.<field>`. The docs
 * address every figure this way, and indexResults turns the array files
 * into the tree the paths walk, so a path resolves the same way whatever
 * the file's layout.
 */
import type {
  BuildFile,
  MatrixFile,
  ProbesFile,
  SizeFile,
  TimingsFile,
} from './schema.ts';

/** Resolves a dotted results path. Keys are split on dots only. */
export function resolvePath(tree: unknown, path: string): unknown {
  let at: unknown = tree;
  const seen: string[] = [];
  for (const key of path.split('.')) {
    if (typeof at !== 'object' || at === null || !(key in at))
      throw new Error(
        `${path} does not resolve at ${[...seen, key].join('.')}`,
      );
    at = (at as Record<string, unknown>)[key];
    seen.push(key);
  }
  return at;
}

export type Family =
  'matrix' | 'probes' | 'size' | 'emit' | 'timings' | 'build';

type Tree = Record<string, unknown>;

/** Sets tree[k0][k1]…[kn] = value, creating the objects on the way. */
function put(tree: Tree, keys: readonly string[], value: unknown): void {
  let at = tree;
  for (const key of keys.slice(0, -1)) {
    at[key] ??= {};
    at = at[key] as Tree;
  }
  at[keys[keys.length - 1]] = value;
}

/** The files a docs build reads. Any may be absent. */
export interface ResultFiles {
  matrix?: MatrixFile;
  probes?: ProbesFile;
  size?: SizeFile;
  timings?: TimingsFile;
  build?: BuildFile;
}

/** Indexes the results files into the tree of the path grammar. */
export function indexResults(files: ResultFiles): Record<Family, Tree> {
  const tree: Record<Family, Tree> = {
    matrix: {},
    probes: {},
    size: {},
    emit: {},
    timings: {},
    build: {},
  };
  for (const { library, variant, toolchain, ...cell } of files.matrix?.cells ??
    [])
    put(tree.matrix, [library, variant, toolchain], cell);
  for (const { library, variant, probe, ...row } of files.probes?.probes ?? [])
    put(tree.probes, [library, variant, probe], row);
  for (const { library, variant, bundler, ...row } of files.size?.sizes ?? [])
    put(tree.size, [library, variant, bundler], row);
  for (const { library, variant, ...row } of files.size?.emit ?? [])
    put(tree.emit, [library, variant], row);
  // A timings path reads the stats fields directly: `…ready.median` is
  // `stats.median`.
  for (const { library, variant, scenario, stats, ...row } of files.timings
    ?.results ?? [])
    put(tree.timings, [library, variant, scenario], { ...stats, ...row });
  if (files.build !== undefined)
    tree.build = { ...files.build.build, headline: files.build.headline };
  return tree;
}
