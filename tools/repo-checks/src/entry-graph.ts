import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

import { importsOf, type SourceFileText } from './core-layers.js';

/**
 * The import graph of a package's main entry (spec section 2.5.9).
 *
 * A package's text pack and its devtools notes are subpath entries of their
 * own, and the main entry must not reach them: an unbundled or CDN import of
 * the main entry would load them otherwise. The walk follows every relative
 * import, export-from and import() from src/index.ts. It skips a declaration
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
    const path = posix.normalize(source).replace(/^src\//, '');
    const rule = path.endsWith('/index.ts')
      ? path.slice(0, -'index.ts'.length)
      : path;
    if (!rules.includes(rule)) rules.push(rule);
  }
  return rules;
}

/**
 * Each module of `forbidden` that `index.ts` reaches through value imports,
 * with the chain that reaches it, and each relative import the walk cannot
 * resolve. Paths are relative to src/.
 */
export function entryGraphViolations(
  files: readonly SourceFileText[],
  forbidden: readonly string[] = ownSubpathModules(undefined),
): string[] {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const paths = new Set(byPath.keys());
  const parent = new Map<string, string | null>([['index.ts', null]]);
  const queue = ['index.ts'];
  const found: string[] = byPath.has('index.ts')
    ? []
    : ['src/index.ts is missing, so the main entry cannot be walked'];
  const chainOf = (path: string): string => {
    const chain: string[] = [];
    for (let at: string | null = path; at !== null; at = parent.get(at) ?? null)
      chain.unshift(at);
    return chain.join(' > ');
  };
  for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
    if (forbidden.some((rule) => matches(rule, path))) {
      found.push(
        `index.ts reaches ${path} (${chainOf(path)}), and the main entry may not import the package text or devtools module`,
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
