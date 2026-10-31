import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The facts of the workspace packages that the front page prints without a
 * benchmark run (docs-site spec 4.6 and site UX spec 4.9 and 4.10): the
 * dependency count of `@nexusdi/core`, and the list of published packages.
 * Both read `libs/*` package files at build time, so a new package appears on
 * the page with no edit here.
 */

const CORE = '@nexusdi/core';
const NPM = 'https://www.npmjs.com/package';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** The number of runtime `dependencies` a package declares. Peers are not counted. */
export function dependencyCount(workspaceRoot, dir = 'core') {
  const json = readJson(join(workspaceRoot, 'libs', dir, 'package.json'));
  return Object.keys(json.dependencies ?? {}).length;
}

/**
 * The docs page of each package: the page whose frontmatter carries
 * `package: '<name>'`, as a root-relative link, or undefined.
 */
function docsPages(contentDir) {
  const pages = new Map();
  for (const file of readdirSync(contentDir)) {
    if (!file.endsWith('.mdx')) continue;
    const head = readFileSync(join(contentDir, file), 'utf8').slice(0, 600);
    const name = /^package:\s*['"]?([^'"\s]+)['"]?\s*$/m.exec(head)?.[1];
    if (name) pages.set(name, `/${file.slice(0, -'.mdx'.length)}/`);
  }
  return pages;
}

/**
 * Every published package: name, description, npm link and docs link
 * (undefined when no page claims the package). `@nexusdi/core` comes first and
 * is marked `required`; the rest follow in name order.
 */
export function workspacePackages(workspaceRoot) {
  const libs = join(workspaceRoot, 'libs');
  const pages = docsPages(join(workspaceRoot, 'apps', 'docs', 'content'));
  return readdirSync(libs)
    .filter((dir) => existsSync(join(libs, dir, 'package.json')))
    .map((dir) => readJson(join(libs, dir, 'package.json')))
    .filter((json) => json.private !== true)
    .map((json) => ({
      name: json.name,
      description: json.description ?? '',
      npm: `${NPM}/${json.name}`,
      docs: pages.get(json.name),
      required: json.name === CORE,
    }))
    .sort(
      (a, b) =>
        Number(b.required) - Number(a.required) || a.name.localeCompare(b.name),
    );
}
