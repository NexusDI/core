/**
 * The checks scripts/adapter-peers.mjs runs after a leg's install: every
 * installed package is inside the leg's spec and inside the peer range of
 * each adapter that declares it, and the adapter reaches one copy of it.
 * The adapter reaches what its own node_modules holds and what the packages
 * it declares (peers and dev dependencies) hold in theirs. A copy elsewhere
 * in the workspace, such as express 4 under @nx/react, is a tool's, which
 * the adapter's tests never load.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import semver from 'semver';

/** The package name of an install spec: `@types/react@19.0.0` is `@types/react`. */
export const packageOf = (spec) => spec.slice(0, spec.lastIndexOf('@'));
/** The range of an install spec: `hono@^4` is `^4`. */
const rangeOf = (spec) => spec.slice(spec.lastIndexOf('@') + 1);

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

/**
 * The problems of a leg after its install, as text, empty when the leg may
 * run: `specs` are its install specs, `libs` the adapters it tests.
 */
export function legProblems(root, specs, libs) {
  const problems = [];
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
    const trees = libs.flatMap((lib) => {
      const adapter = readJson(join(lib, 'package.json'));
      const declared = Object.keys({
        ...adapter.peerDependencies,
        ...adapter.devDependencies,
      });
      return [
        join(lib, 'node_modules'),
        ...declared.map((dep) =>
          join(root, 'node_modules', dep, 'node_modules'),
        ),
      ];
    });
    for (const tree of new Set(trees))
      for (const copy of copiesUnder(tree, pkg))
        if (copy !== manifest)
          problems.push(
            `${pkg}: a second copy at ${copy.slice(0, -'/package.json'.length)} (${readJson(copy).version})`,
          );
  }
  return problems;
}
