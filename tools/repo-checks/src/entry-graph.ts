import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

import {
  importsOf,
  matches,
  resolveRelative,
  type SourceFileText,
} from './core-layers.js';

/**
 * The import graph of a package's main entry (spec section 2.5.9).
 *
 * A package's text pack and its devtools notes are subpath entries of their
 * own, and the main entry must not reach them: an unbundled or CDN import of
 * the main entry would load them otherwise. The walk follows every relative
 * import, export-from and import() from the `.` export's source file. It skips a declaration
 * that brings in types only, since the compiler erases it.
 */

/**
 * A test file: `.test`, `.spec` or `.test-d`, of any JS or TS extension. A
 * browser test (`.browser.test.ts`) ends in `.test.ts`, so it matches too.
 */
export const TEST_FILE = /\.(test|spec|test-d)\.[cm]?[jt]sx?$/;

/** Every folder directly under `dir`, sorted by name. */
export function libDirs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Every file under `dir`, sorted, forward-slashed and relative to `root`;
 * none when `dir` does not exist.
 */
export function filesUnder(dir: string, root = dir): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  }))
    if (entry.isFile())
      found.push(
        relative(root, join(entry.parentPath, entry.name))
          .split(sep)
          .join(posix.sep),
      );
  return found.sort();
}

/**
 * Every non-test `.ts` file under `dir`, with `path` relative to `root`;
 * none when `dir` does not exist.
 */
export function sourcesOf(dir: string, root = dir): SourceFileText[] {
  return filesUnder(dir, root)
    .filter((path) => path.endsWith('.ts') && !TEST_FILE.test(path))
    .map((path) => ({ path, source: readFileSync(join(root, path), 'utf8') }));
}

/** A package under libs/: what its manifest declares, and its sources. */
export interface LibPackage {
  /** The folder under libs/, such as `core`. */
  readonly dir: string;
  readonly name: string;
  readonly exports: unknown;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly peerDependencies: Readonly<Record<string, string>>;
  /** The peers `peerDependenciesMeta` marks optional. */
  readonly optionalPeers: readonly string[];
  /** Every non-test `.ts` file under its src/, none when it has no src/. */
  readonly files: readonly SourceFileText[];
}

interface Manifest {
  readonly name: string;
  readonly exports?: unknown;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

/**
 * Every folder of `libs` that holds a package.json, read on each call, so a
 * package another branch adds is checked without an edit here. A fixture
 * passes another `manifestFile`, since nx reads every package.json in the
 * workspace as a project.
 */
export function libPackages(
  libs: string,
  manifestFile = 'package.json',
): LibPackage[] {
  return libDirs(libs)
    .filter((dir) => existsSync(join(libs, dir, manifestFile)))
    .map((dir) => {
      const manifest = JSON.parse(
        readFileSync(join(libs, dir, manifestFile), 'utf8'),
      ) as Manifest;
      return {
        dir,
        name: manifest.name,
        exports: manifest.exports,
        dependencies: manifest.dependencies ?? {},
        peerDependencies: manifest.peerDependencies ?? {},
        optionalPeers: Object.entries(manifest.peerDependenciesMeta ?? {})
          .filter(([, meta]) => meta.optional === true)
          .map(([peer]) => peer),
        files: sourcesOf(join(libs, dir, 'src')),
      };
    });
}

/** The source file of one exports entry: the entry itself, or its `@nexusdi/source` condition. */
function sourceOf(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry;
  if (typeof entry !== 'object' || entry === null) return undefined;
  const source = (entry as Record<string, unknown>)['@nexusdi/source'];
  return typeof source === 'string' ? source : undefined;
}

/** A source path from package.json, relative to src/. */
function underSrc(source: string): string {
  return posix.normalize(source).replace(/^src\//, '');
}

/**
 * The source file of the `subpath` export, relative to src/: its
 * `@nexusdi/source`, or the entry itself when it is a string. Null for a
 * package with no such export, undefined for an export without a source
 * file.
 */
export function subpathEntryOf(
  exports: unknown,
  subpath: string,
): string | null | undefined {
  if (typeof exports !== 'object' || exports === null || !(subpath in exports))
    return null;
  const source = sourceOf((exports as Record<string, unknown>)[subpath]);
  return source === undefined ? undefined : underSrc(source);
}

/**
 * The main entry's source file, relative to src/: the `.` export's
 * `@nexusdi/source`. Null for a package with no `.` export; throws for a `.`
 * export without a source file, which the walk could not start from.
 */
export function mainEntryOf(exports: unknown): string | null {
  const entry = subpathEntryOf(exports, '.');
  if (entry === undefined)
    throw new Error('exports . has no @nexusdi/source file');
  return entry;
}

/**
 * The modules under src/ the main entry may not reach: `text.ts`, `text/`
 * and `devtools/` by convention, and the source module of a `./text` or
 * `./devtools` export. An `index.ts` source stands for its whole folder.
 */
export function ownSubpathModules(exports: unknown): string[] {
  const rules = ['text.ts', 'text/', 'devtools/'];
  for (const subpath of ['./text', './devtools']) {
    const path = subpathEntryOf(exports, subpath);
    if (typeof path !== 'string') continue;
    const rule = path.endsWith('/index.ts')
      ? path.slice(0, -'index.ts'.length)
      : path;
    if (!rules.includes(rule)) rules.push(rule);
  }
  return rules;
}

/** One step of a walk: a module it reaches, or an import it cannot resolve. */
export type WalkStep =
  | { readonly kind: 'module'; readonly path: string; readonly chain: string }
  | {
      readonly kind: 'unresolved';
      readonly path: string;
      readonly specifier: string;
    };

/**
 * The modules `entry` reaches through value imports, breadth first, each
 * with the chain that reaches it (`index.ts > feature.ts`), and each
 * relative import the walk cannot resolve. The walk does not descend into a
 * module `stop` matches. Paths are relative to src/.
 */
export function* walkEntry(
  files: readonly SourceFileText[],
  entry: string,
  stop: (path: string) => boolean = () => false,
): Generator<WalkStep> {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const paths = new Set(byPath.keys());
  const parent = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  const chainOf = (path: string): string => {
    const chain: string[] = [];
    for (let at: string | null = path; at !== null; at = parent.get(at) ?? null)
      chain.unshift(at);
    return chain.join(' > ');
  };
  for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
    const file = byPath.get(path);
    if (file === undefined) continue;
    yield { kind: 'module', path, chain: chainOf(path) };
    if (stop(path)) continue;
    for (const { specifier, typeOnly } of importsOf(file)) {
      if (typeOnly || !specifier.startsWith('.')) continue;
      const target = resolveRelative(path, specifier, paths);
      if (target === null) {
        yield { kind: 'unresolved', path, specifier };
        continue;
      }
      if (parent.has(target)) continue;
      parent.set(target, path);
      queue.push(target);
    }
  }
}

/**
 * Each module of `forbidden` that `entry` reaches through value imports,
 * with the chain that reaches it, and each relative import the walk cannot
 * resolve. Paths are relative to src/.
 */
export function entryGraphViolations(
  files: readonly SourceFileText[],
  forbidden: readonly string[] = ownSubpathModules(undefined),
  entry = 'index.ts',
): string[] {
  if (!files.some((file) => file.path === entry))
    return [`src/${entry} is missing, so the main entry cannot be walked`];
  const isForbidden = (path: string) =>
    forbidden.some((rule) => matches(rule, path));
  const found: string[] = [];
  for (const step of walkEntry(files, entry, isForbidden)) {
    if (step.kind === 'unresolved')
      found.push(
        `${step.path} imports ${step.specifier}, which resolves to no file under src/`,
      );
    else if (isForbidden(step.path))
      found.push(
        `${entry} reaches ${step.path} (${step.chain}), and the main entry may not import the package text or devtools module`,
      );
  }
  return found;
}
