import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

import { importsOf, type SourceFileText } from './core-layers.js';

/**
 * The import graph of a package's main entry (spec section 2.5.9).
 *
 * A package's text pack and its devtools notes are subpath entries of their
 * own, and the main entry must not reach them: an unbundled or CDN import of
 * the main entry would load them otherwise. The walk follows every relative
 * import, export-from and import() from the `.` export's source file. It skips a declaration
 * that brings in types only, since the compiler erases it.
 */

const TEST = /\.(test|spec|test-d|browser\.test)\.ts$/;

/** Every non-test `.ts` file under `dir`, with `path` relative to `dir`. */
export function sourcesOf(dir: string): SourceFileText[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith('.ts') && !TEST.test(entry.name),
    )
    .map((entry) => join(entry.parentPath, entry.name))
    .map((file) => ({
      path: relative(dir, file).split(sep).join(posix.sep),
      source: readFileSync(file, 'utf8'),
    }));
}

/** A package under libs/: its manifest's name and exports, and its sources. */
export interface LibPackage {
  /** The folder under libs/, such as `core`. */
  readonly dir: string;
  readonly name: string;
  readonly exports: unknown;
  /** Every non-test `.ts` file under its src/, none when it has no src/. */
  readonly files: readonly SourceFileText[];
}

/**
 * Every folder of `libs` that holds a package.json, read on each call, so a
 * package another branch adds is checked without an edit here.
 */
export function libPackages(libs: string): LibPackage[] {
  return readdirSync(libs, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(libs, entry.name, 'package.json')),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name: dir }) => {
      const manifest = JSON.parse(
        readFileSync(join(libs, dir, 'package.json'), 'utf8'),
      ) as { name: string; exports?: unknown };
      const src = join(libs, dir, 'src');
      return {
        dir,
        name: manifest.name,
        exports: manifest.exports,
        files: existsSync(src) ? sourcesOf(src) : [],
      };
    });
}

/** The module a relative specifier names among `paths`, or null. */
export function resolveRelative(
  from: string,
  specifier: string,
  paths: ReadonlySet<string>,
): string | null {
  const joined = posix.join(posix.dirname(from), specifier);
  for (const candidate of [
    joined.replace(/\.js$/, '.ts'),
    joined,
    `${joined}.ts`,
    `${joined}/index.ts`,
  ])
    if (paths.has(candidate)) return candidate;
  return null;
}

/** A rule's match: a folder prefix, or one file. */
function matches(rule: string, path: string): boolean {
  return rule.endsWith('/') ? path.startsWith(rule) : path === rule;
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
 * The main entry's source file, relative to src/: the `.` export's
 * `@nexusdi/source`. Null for a package with no `.` export; throws for a `.`
 * export without a source file, which the walk could not start from.
 */
export function mainEntryOf(exports: unknown): string | null {
  if (typeof exports !== 'object' || exports === null || !('.' in exports))
    return null;
  const source = sourceOf((exports as Record<string, unknown>)['.']);
  if (source === undefined)
    throw new Error('exports . has no @nexusdi/source file');
  return underSrc(source);
}

/**
 * The modules under src/ the main entry may not reach: `text.ts`, `text/`
 * and `devtools/` by convention, and the source module of a `./text` or
 * `./devtools` export. An `index.ts` source stands for its whole folder.
 */
export function ownSubpathModules(exports: unknown): string[] {
  const rules = ['text.ts', 'text/', 'devtools/'];
  if (typeof exports !== 'object' || exports === null) return rules;
  for (const subpath of ['./text', './devtools']) {
    const source = sourceOf((exports as Record<string, unknown>)[subpath]);
    if (source === undefined) continue;
    const path = underSrc(source);
    const rule = path.endsWith('/index.ts')
      ? path.slice(0, -'index.ts'.length)
      : path;
    if (!rules.includes(rule)) rules.push(rule);
  }
  return rules;
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
  const byPath = new Map(files.map((file) => [file.path, file]));
  const paths = new Set(byPath.keys());
  const parent = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  const found: string[] = byPath.has(entry)
    ? []
    : [`src/${entry} is missing, so the main entry cannot be walked`];
  const chainOf = (path: string): string => {
    const chain: string[] = [];
    for (let at: string | null = path; at !== null; at = parent.get(at) ?? null)
      chain.unshift(at);
    return chain.join(' > ');
  };
  for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
    if (forbidden.some((rule) => matches(rule, path))) {
      found.push(
        `${entry} reaches ${path} (${chainOf(path)}), and the main entry may not import the package text or devtools module`,
      );
      continue;
    }
    const file = byPath.get(path);
    if (file === undefined) continue;
    for (const { specifier, typeOnly } of importsOf(file)) {
      if (typeOnly || !specifier.startsWith('.')) continue;
      const target = resolveRelative(path, specifier, paths);
      if (target === null) {
        found.push(
          `${path} imports ${specifier}, which resolves to no file under src/`,
        );
        continue;
      }
      if (parent.has(target)) continue;
      parent.set(target, path);
      queue.push(target);
    }
  }
  return found;
}
