import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The workspace root, found from the build's working directory (`apps/docs`
 * under Nx, the root under a plain `next build`) by the `libs/core` folder.
 */
export function workspaceRoot(from: string = process.cwd()): string {
  let at = from;
  for (;;) {
    if (existsSync(join(at, 'libs', 'core', 'package.json'))) return at;
    const up = dirname(at);
    if (up === at) {
      throw new Error(`No workspace with libs/core above ${from}.`);
    }
    at = up;
  }
}
