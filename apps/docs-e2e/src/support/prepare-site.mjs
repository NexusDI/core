import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..', '..', '..');
export const SITE = join(root, 'apps', 'docs-e2e', '.site');

/**
 * Builds the /next/ site with the script the deploy runs (docs spec §15.3)
 * and lays it out as GitHub Pages serves it during the RC: the export under
 * `next/`, and a root `404.html` whose script sends a missing `/next/...`
 * path to the new site's own 404 page (spec §15.5). Task 80 lays the same
 * build out with `assemble()` in rc mode.
 */
export async function prepareSite() {
  rmSync(SITE, { recursive: true, force: true });
  mkdirSync(SITE, { recursive: true });

  execFileSync(
    'node',
    [
      'apps/docs/tools/deploy/build-site.mjs',
      'next',
      '--tree',
      '.',
      '--out',
      join(SITE, 'next'),
    ],
    { cwd: root, stdio: 'inherit' },
  );

  writeFileSync(
    join(SITE, '404.html'),
    [
      '<!doctype html>',
      '<html lang="en"><head><meta charset="utf-8"><title>Not found</title>',
      '<script>if (location.pathname.startsWith("/next/")) location.replace("/next/404.html");</script>',
      '</head><body><p>Not found.</p></body></html>',
      '',
    ].join('\n'),
  );

  if (!existsSync(join(SITE, 'next', 'index.html'))) {
    throw new Error('The /next/ export has no index.html.');
  }
}
