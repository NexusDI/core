import { createHash } from 'node:crypto';
import { join } from 'node:path';

/**
 * The port this checkout serves the docs e2e site on, and the id its server
 * answers with.
 *
 * Several worktrees run the e2e suite on one machine, and Playwright's
 * `reuseExistingServer` attaches to whatever answers on the port. A fixed
 * port let one worktree test another's build. Each checkout takes a port
 * from a hash of its own path, between 4310 and 5309, so two worktrees rarely
 * share one. `DOCS_E2E_PORT` overrides it.
 *
 * Two checkouts can still hash to one port, so the server also answers
 * `CHECKOUT_PATH?checkout=<id>` with 200 for its own checkout's id and 409
 * for any other (`serve.mjs`). Playwright's `webServer.url` asks with this
 * checkout's id, so it never reuses another checkout's server: it starts its
 * own, which fails on the taken port and says whose it is.
 */
const checkout = join(import.meta.dirname, '..', '..', '..', '..');
const digest = createHash('sha256').update(checkout).digest();
const hashed = 4310 + (digest.readUInt32BE(0) % 1000);

/** This checkout's id: a hash of its path. */
export const CHECKOUT = digest.toString('hex').slice(0, 16);

/** The path a server answers its checkout's id on. */
export const CHECKOUT_PATH = '/__docs-e2e-checkout';

export const PORT = Number(process.env['DOCS_E2E_PORT'] ?? hashed);
