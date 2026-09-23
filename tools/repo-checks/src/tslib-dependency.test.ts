import { createProjectGraphAsync, parseJson, workspaceRoot } from '@nx/devkit';
import type { ProjectGraphProjectNode } from '@nx/devkit';
import { findMatchingProjects } from 'nx/src/devkit-internals';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The invariant: a released package declares tslib as a runtime dependency
 * exactly when its emitted JavaScript is allowed to import one.
 *
 * `importHelpers` turns an emitted helper into `import { __helper } from
 * "tslib"`, which makes tslib a runtime dependency of the output. At target
 * es2022 few constructs emit one -- a decorator of either flavour, a `using`
 * declaration -- so a package can carry `importHelpers`, emit no such import,
 * and look as though the declaration were optional. It is not. The first
 * construct that does emit a helper turns a missing declaration into a
 * module-not-found error in a consumer's install, and nothing inside the repo
 * sees it: the build succeeds, every test passes, and tslib resolves from the
 * workspace root regardless.
 *
 * Both directions are checked, because both are wrong. `importHelpers` without
 * the declaration is the break above. The declaration without `importHelpers`
 * is a package every consumer installs for an import its output cannot contain.
 *
 * This is the configuration half, and it holds whether or not a helper happens
 * to be emitted today. scripts/verify-packaging.mjs is the other half: it reads
 * the tslib specifiers in the packed tarball, which is the emit itself rather
 * than the setting that governs it.
 */

const TSLIB = 'tslib';

interface TsConfig {
  extends?: string | string[];
  compilerOptions?: { importHelpers?: boolean };
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function readJson<T extends object>(file: string): T {
  return parseJson<T>(readFileSync(file, 'utf-8'), { expectComments: true });
}

/**
 * The value tsc resolves for a config, reading the `extends` chain
 * nearest-first the way tsc does. A base that cannot be located is an error
 * rather than a missing value: a guard that silently reads `undefined` for
 * an option set two levels up asserts nothing.
 */
function effectiveImportHelpers(config: string): boolean {
  // tsc's own default, where nothing in the chain sets the option.
  return declaredImportHelpers(config) ?? false;
}

function declaredImportHelpers(config: string): boolean | undefined {
  const { extends: bases, compilerOptions = {} } = readJson<TsConfig>(config);

  if (typeof compilerOptions.importHelpers === 'boolean') {
    return compilerOptions.importHelpers;
  }

  const chain = typeof bases === 'string' ? [bases] : (bases ?? []);
  // tsc applies later entries in an `extends` array over earlier ones, so
  // the nearest definition is found by reading the list backwards.
  for (const base of [...chain].reverse()) {
    const resolved = resolve(dirname(config), base);
    if (!existsSync(resolved)) {
      throw new Error(
        `${config} extends ${base}, which does not resolve to a file. ` +
          `This check reads the extends chain itself and cannot follow a ` +
          `specifier resolved through node_modules.`,
      );
    }
    const inherited = declaredImportHelpers(resolved);
    if (typeof inherited === 'boolean') return inherited;
  }

  return undefined;
}

/**
 * The tsconfig a project's `build` target compiles, when that target is
 * `tsc --build` over one. A project built by anything else emits its
 * JavaScript through a bundler, which resolves the helper at build time and
 * leaves no import behind.
 */
function tscBuildConfig(project: ProjectGraphProjectNode): string | undefined {
  const target = project.data.targets?.['build'];
  const command = String(
    (target?.options as { command?: unknown } | undefined)?.command ?? '',
  );
  if (!command.startsWith('tsc --build')) return undefined;

  return command
    .split(/\s+/)
    .slice(2)
    .filter((arg) => !arg.startsWith('-'))
    .map((arg) => resolve(workspaceRoot, project.data.root, arg))
    .find(existsSync);
}

function manifestOf(project: ProjectGraphProjectNode): PackageJson {
  return readJson<PackageJson>(
    join(workspaceRoot, project.data.root, 'package.json'),
  );
}

function readReleaseProjectPatterns(): string[] {
  const nxJson = parseJson<{ release?: { projects?: string | string[] } }>(
    readFileSync(join(workspaceRoot, 'nx.json'), 'utf-8'),
    { expectComments: true },
  );
  const patterns = nxJson.release?.projects;

  expect(patterns, 'nx.json must define release.projects').toBeDefined();

  return Array.isArray(patterns) ? patterns : [patterns as string];
}

let released: Promise<ProjectGraphProjectNode[]> | undefined;

/** One project graph for the whole file; computing it costs seconds. */
function releasedProjects(): Promise<ProjectGraphProjectNode[]> {
  released ??= (async () => {
    const graph = await createProjectGraphAsync({ exitOnError: false });
    const names = findMatchingProjects(
      readReleaseProjectPatterns(),
      graph.nodes,
    );

    expect(
      names.length,
      'release.projects matched no projects -- the globs or the graph are wrong',
    ).toBeGreaterThan(0);

    return names.map((name) => graph.nodes[name] as ProjectGraphProjectNode);
  })();

  return released;
}

describe('tslib dependencies', () => {
  it('are declared by exactly the tsc-built packages that import helpers', async () => {
    const mismatched: string[] = [];

    for (const project of await releasedProjects()) {
      const config = tscBuildConfig(project);
      if (!config) continue;

      const imports = effectiveImportHelpers(config);
      const declared = TSLIB in (manifestOf(project).dependencies ?? {});

      if (imports && !declared) {
        mismatched.push(
          `${project.name}: importHelpers is on, so add "${TSLIB}" to its ` +
            `dependencies -- its output may import helpers from a package the ` +
            `consumer does not install`,
        );
      }
      if (!imports && declared) {
        mismatched.push(
          `${project.name}: importHelpers is off, so drop "${TSLIB}" from its ` +
            `dependencies -- its output cannot import it and every consumer ` +
            `installs it anyway`,
        );
      }
    }

    expect(mismatched.sort()).toEqual([]);
  });

  it('are runtime dependencies wherever they are declared', async () => {
    // A helper import is in the emitted JavaScript, so the consumer resolves it
    // at runtime. Declared anywhere else it is absent from the install.
    const misplaced: string[] = [];

    for (const project of await releasedProjects()) {
      const manifest = manifestOf(project);
      for (const field of ['devDependencies', 'peerDependencies'] as const) {
        if (TSLIB in (manifest[field] ?? {})) {
          misplaced.push(`${project.name}: ${TSLIB} is in ${field}`);
        }
      }
    }

    expect(misplaced.sort()).toEqual([]);
  });

  // Every released package here is tsc --build, so there is no bundled
  // package to check tslib's absence against. Once a bundled library exists,
  // add back the third invariant from the libraries repo: tslib is absent
  // from every released package whose JavaScript is bundled, since a bundler
  // inlines the helper and leaves nothing for the declaration to cover.
});
