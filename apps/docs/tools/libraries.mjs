import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The packages that publish a library entry, read from their package files
 * (spec section 22, item 7). A package joins by publishing one, so a new
 * package needs no edit here, and `@nexusdi/cli`, which publishes a bin only,
 * stays out.
 */
export function libraries(workspaceRoot) {
  const libs = join(workspaceRoot, 'libs');
  return readdirSync(libs)
    .filter((dir) => existsSync(join(libs, dir, 'package.json')))
    .map((dir) => ({
      dir,
      json: JSON.parse(readFileSync(join(libs, dir, 'package.json'), 'utf8')),
    }))
    .filter(({ json }) =>
      Object.keys(json.exports ?? {}).some((key) => key !== './package.json'),
    )
    .map(({ dir, json }) => ({ name: json.name, root: `libs/${dir}`, dir }))
    .sort((a, b) => a.dir.localeCompare(b.dir));
}
