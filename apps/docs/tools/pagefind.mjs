import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Indexes the static export with Pagefind. It runs from `postbuild`, which the
 * docs workflow calls as its own step because Nx invokes `next build` directly
 * and npm's lifecycle never fires.
 *
 * No `--base-url`: Nextra's search loads `addBasePath('/_pagefind/pagefind.js')`
 * and navigates results through `next/link`, which adds the base path, so a
 * root-relative result URL resolves under `/next/` (spec §15.4).
 */

export function assertBuilt(out) {
  if (!existsSync(join(out, 'index.html'))) {
    throw new Error(
      `${out} has no index.html. Run \`npx nx build @nexusdi/docs\` first.`,
    );
  }
}

export function pagefindArgs(out) {
  return ['pagefind', '--site', out, '--output-path', join(out, '_pagefind')];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = join(import.meta.dirname, '..', 'out');
  assertBuilt(out);
  execFileSync('npx', pagefindArgs(out), { stdio: 'inherit' });
}
