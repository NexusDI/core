import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { RegionError, parseRegions } from './regions.mjs';

/**
 * The files a package's examples live in, as the docs site cites them.
 *
 * The README is the package's npm landing page and carries its first
 * example. The examples a docs page or a reference entry names live in
 * `docs/*.md`, which the package's `files` leaves out of the tarball. Both run
 * as tests of the package, through `docExampleSources()`. Core keeps one file
 * per subject (`docs/providers.md`, `docs/scopes.md`), so this returns a list.
 */
export function examplesFilesIn(packageDir) {
  const docs = join(packageDir, 'docs');
  const pages = existsSync(docs)
    ? readdirSync(docs)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) => join(docs, name))
    : [];
  return [join(packageDir, 'README.md'), ...pages];
}

/**
 * The package directory a markdown file of examples belongs to. A path
 * operation only: the preamble sits at the package root, beside `README.md`
 * and one level above `docs/`.
 */
export function packageDirOf(file) {
  const dir = dirname(file);
  return basename(dir) === 'docs' ? dirname(dir) : dir;
}

/**
 * The one file among `files` that holds `region`.
 *
 * A region name is unique within a package, so a directive names a region and
 * no file. Two files holding one name would make the entry's example depend on
 * the order this reads them in, so that fails, and so does a name no file
 * holds. A file that is absent holds nothing. A malformed region throws the
 * `RegionError` `parseRegions` raises, which names the file and the line.
 */
export function regionFileOf(
  files,
  region,
  read = (path) => readFileSync(path, 'utf8'),
) {
  const holding = files.filter((file) => {
    let source;
    try {
      source = read(file);
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
    return parseRegions(source, file).has(region);
  });

  if (holding.length === 1) return holding[0];
  throw new RegionError(
    holding.length === 0
      ? `no file holds the region '${region}'; read ${files.join(', ')}`
      : `the region '${region}' is in ${holding.join(' and ')}; rename one`,
  );
}
