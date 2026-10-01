import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every file under a directory tree that `keep` accepts, sorted.
 *
 * `keep` takes a file's own name and returns whether to list it. `skipDir`,
 * when given, takes a directory's full path and returns whether the walk
 * skips it.
 */
export function filesUnder(dir, keep, skipDir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return skipDir?.(path) ? [] : filesUnder(path, keep, skipDir);
      }
      return keep(entry.name) ? [path] : [];
    })
    .sort();
}
