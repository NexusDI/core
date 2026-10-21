/**
 * The checks scripts/adapter-peers.mjs runs after a leg's install: every
 * installed package is inside the leg's spec and inside the peer range of
 * each adapter that declares it, and the adapter reaches one copy of it.
 * The adapter reaches what its own node_modules holds and what the packages
 * it declares (peers and dev dependencies) hold in theirs. A copy elsewhere
 * in the workspace, such as express 4 under @nx/react, is a tool's, which
 * the adapter's tests never load.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { join } from 'node:path';

import semver from 'semver';

/** The package name of an install spec: `@types/react@19.0.0` is `@types/react`. */
export const packageOf = (spec) => spec.slice(0, spec.lastIndexOf('@'));
/** The range of an install spec: `hono@^4` is `^4`. */
const rangeOf = (spec) => spec.slice(spec.lastIndexOf('@') + 1);

/**
 * The install specs of a leg: its `install` list plus one exact spec per
 * package of each family. A family names packages that release together at
 * one version (react-router and @react-router/*). Its `version` is a
 * range, or an exact version, and the family installs the highest version
 * every member has published inside it, so a member that lags the rest
 * (a release published to some packages first) holds the family back.
 * `published(spec)` returns the versions of a package a range admits.
 */
export function installSpecs(leg, published = npmVersions) {
  const specs = [...(leg.install ?? [])];
  for (const family of leg.families ?? []) {
    const { packages, version } = family;
    const label = `family ${(packages ?? []).join(', ') || '(empty)'} at ${version}`;
    if (!Array.isArray(packages) || packages.length === 0)
      throw new Error(`${label}: a family needs at least one package`);
    const sets = packages.map((pkg) => {
      try {
        return new Set(published(`${pkg}@${version}`));
      } catch (error) {
        throw new Error(`${label}: npm view ${pkg}@${version} failed`, {
          cause: error,
        });
      }
    });
    const common = sets.reduce(
      (a, b) => new Set([...a].filter((v) => b.has(v))),
    );
    const best = semver.rsort([...common])[0];
    if (!best)
      throw new Error(
        `${label}: no version satisfies the range for every package`,
      );
    specs.push(...packages.map((pkg) => `${pkg}@${best}`));
  }
  return specs;
}

/** The versions npm holds for a `name@range` spec. */
function npmVersions(spec) {
  const out = execFileSync('npm', ['view', spec, 'version', '--json'], {
    encoding: 'utf8',
  });
  return [].concat(JSON.parse(out));
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** Every `<pkg>/package.json` under `modules`, a node_modules folder, at any depth. */
function copiesUnder(modules, pkg, found = []) {
  if (!existsSync(modules)) return found;
  for (const entry of readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const names = entry.name.startsWith('@')
      ? readdirSync(join(modules, entry.name)).map((n) => `${entry.name}/${n}`)
      : [entry.name];
    for (const name of names) {
      const dir = join(modules, name);
      // A workspace link: that package's own copies are not the adapter's.
      if (lstatSync(dir).isSymbolicLink()) continue;
      if (name === pkg && existsSync(join(dir, 'package.json')))
        found.push(join(dir, 'package.json'));
      copiesUnder(join(dir, 'node_modules'), pkg, found);
    }
  }
  return found;
}

/** The names a manifest declares: peers, dependencies and dev dependencies. */
const declaredBy = (manifest) =>
  Object.keys({
    ...manifest.peerDependencies,
    ...manifest.dependencies,
    ...manifest.devDependencies,
  });

/**
 * The node_modules folders an adapter reaches: its own, each declared
 * package's (through a workspace link's real path, so a linked lib such as
 * libs/core counts), and those of the packages each of them declares.
 */
function treesOf(root, lib) {
  const trees = [join(lib, 'node_modules')];
  const adapter = readJson(join(lib, 'package.json'));
  for (const dep of declaredBy(adapter)) {
    const installed = join(root, 'node_modules', dep);
    if (!existsSync(installed)) continue;
    const real = realpathSync(installed);
    trees.push(join(real, 'node_modules'));
    const manifest = join(real, 'package.json');
    if (!existsSync(manifest)) continue;
    for (const next of declaredBy(readJson(manifest))) {
      const nested = join(root, 'node_modules', next);
      if (existsSync(nested))
        trees.push(join(realpathSync(nested), 'node_modules'));
    }
  }
  return trees;
}

/**
 * The problems of a leg after its install, as text, empty when the leg may
 * run: `specs` are its install specs, `libs` the adapters it tests.
 * `exceptions` maps a package to the peers of it the leg does not check,
 * each with the reason; an exception that no longer applies is a problem.
 */
export function legProblems(root, specs, libs, exceptions = {}) {
  const problems = [];
  const installed = specs.map(packageOf);
  for (const pkg of Object.keys(exceptions))
    if (!installed.includes(pkg))
      problems.push(
        `peer exception for ${pkg}, which the leg does not install`,
      );
  for (const spec of specs) {
    const pkg = packageOf(spec);
    const manifest = join(root, 'node_modules', pkg, 'package.json');
    if (!existsSync(manifest)) {
      problems.push(`${pkg} is not installed at the root`);
      continue;
    }
    const { version } = readJson(manifest);
    if (!semver.satisfies(version, rangeOf(spec)))
      problems.push(
        `${pkg} ${version} is outside the leg spec ${rangeOf(spec)}`,
      );
    for (const lib of libs) {
      const adapter = readJson(join(lib, 'package.json'));
      const peer = adapter.peerDependencies?.[pkg];
      if (peer !== undefined && !semver.satisfies(version, peer))
        problems.push(
          `${pkg} ${version} is outside ${adapter.name}'s peer range ${peer}`,
        );
    }
    // npm skips these checks under --legacy-peer-deps, so run them here for
    // the leg's own packages: each peer the installed copy declares, unless
    // optional, must be satisfied by the copy at the root.
    const { peerDependencies = {}, peerDependenciesMeta = {} } =
      readJson(manifest);
    for (const [peer, range] of Object.entries(peerDependencies)) {
      if (peerDependenciesMeta[peer]?.optional) continue;
      const peerManifest = join(root, 'node_modules', peer, 'package.json');
      if (!existsSync(peerManifest)) continue;
      const peerVersion = readJson(peerManifest).version;
      const satisfied = semver.satisfies(peerVersion, range, {
        includePrerelease: true,
      });
      if (exceptions[pkg]?.[peer] !== undefined) {
        if (satisfied)
          problems.push(
            `${pkg} ${version} peer ${peer} ${range} is met by the root's ${peerVersion}, drop the exception`,
          );
        continue;
      }
      if (!satisfied)
        problems.push(
          `${pkg} ${version} needs ${peer} ${range}, the root has ${peerVersion}`,
        );
    }
    for (const peer of Object.keys(exceptions[pkg] ?? {}))
      if (
        peerDependencies[peer] === undefined ||
        peerDependenciesMeta[peer]?.optional
      )
        problems.push(
          `peer exception ${pkg} > ${peer}, which ${pkg} ${version} does not declare as a required peer`,
        );
    const trees = libs.flatMap((lib) => treesOf(root, lib));
    for (const tree of new Set(trees))
      for (const copy of copiesUnder(tree, pkg))
        if (realpathSync(copy) !== realpathSync(manifest))
          problems.push(
            `${pkg}: a second copy at ${copy.slice(0, -'/package.json'.length)} (${readJson(copy).version})`,
          );
  }
  return problems;
}
