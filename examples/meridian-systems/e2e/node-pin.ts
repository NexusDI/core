import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Stops the run when the Node differs from the workspace's `.nvmrc`. The
 * golden holds values from `Math.exp` and `Math.cos`, and the last bit of
 * those may differ between engine versions, so the file is only valid on the
 * version that wrote it.
 */
export default function setup(): void {
  const pinned = readFileSync(
    join(import.meta.dirname, '../../../.nvmrc'),
    'utf-8',
  )
    .trim()
    .replace(/^v/, '');
  const current = process.versions.node;

  if (current !== pinned) {
    throw new Error(
      `the goldens run on Node ${pinned} (.nvmrc); this is Node ${current}`,
    );
  }
}
