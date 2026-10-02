import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..', '..', '..', '..');
const e2e = join(root, 'apps', 'docs-e2e');
const built = join(e2e, '.next-out');
export const SITE = join(e2e, '.site');

// Loaded by a computed URL: a static import would make Nx infer a project
// reference to apps/docs, which `tsc --build` rejects (that project emits
// nothing).
const assembleUrl = pathToFileURL(
  join(root, 'apps', 'docs', 'tools', 'deploy', 'assemble.mjs'),
).href;

/**
 * Builds the /next/ site with the deploy's script and assembles the rc
 * artifact from it: a snapshot at the root (a fixture here), the new site
 * under next/, the root 404 script and the /errors/<CODE>/ stubs (docs spec
 * §15.5). The suite then runs against what GitHub Pages serves.
 * `SKIP_DOCS_BUILD=1` reuses the last build.
 */
export async function prepareSite() {
  if (process.env.SKIP_DOCS_BUILD !== '1') {
    rmSync(built, { recursive: true, force: true });
    execFileSync(
      'node',
      [
        'apps/docs/tools/deploy/build-site.mjs',
        'next',
        '--tree',
        '.',
        '--out',
        built,
      ],
      { cwd: root, stdio: 'inherit' },
    );
  }

  const { assemble } = await import(assembleUrl);
  const { files } = assemble({
    mode: 'rc',
    site: SITE,
    nextOut: built,
    snapshotRoot: join(e2e, 'fixtures', 'snapshot-root'),
  });
  console.log(`apps/docs-e2e/.site holds ${files} files`);
}
