import { createHash } from 'node:crypto';
import { join } from 'node:path';

/**
 * The port this checkout serves the docs e2e site on.
 *
 * Several worktrees run the e2e suite on one machine, and Playwright's
 * `reuseExistingServer` attaches to whatever answers on the port. A fixed
 * port let one worktree test another's build. Each checkout takes a port
 * from a hash of its own path, between 4310 and 5309, so two worktrees never
 * share one. `DOCS_E2E_PORT` overrides it.
 */
const checkout = join(import.meta.dirname, '..', '..', '..', '..');
const hashed =
  4310 +
  (createHash('sha256').update(checkout).digest().readUInt32BE(0) % 1000);

export const PORT = Number(process.env['DOCS_E2E_PORT'] ?? hashed);
