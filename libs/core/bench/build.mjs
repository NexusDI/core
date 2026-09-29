/**
 * Bundles core twice from source with the same esbuild options. The `off`
 * build serves hook-sites.ts with HOOK_SITES false, so it differs from the
 * `on` build only in the hook sites (spec 17.3).
 */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ENTRY = join(import.meta.dirname, '..', 'src', 'index.ts');

const hookSitesOff = {
  name: 'hook-sites-off',
  setup(b) {
    b.onLoad({ filter: /[/\\]definitions[/\\]hook-sites\.ts$/ }, () => ({
      contents: 'export const HOOK_SITES = false;',
      loader: 'ts',
    }));
  },
};

export async function buildDispatch(outDir) {
  mkdirSync(outDir, { recursive: true });
  const common = {
    entryPoints: [ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'node',
    minifySyntax: true,
    logLevel: 'error',
  };
  const on = join(outDir, 'on.mjs');
  const off = join(outDir, 'off.mjs');
  await build({ ...common, outfile: on });
  await build({ ...common, outfile: off, plugins: [hookSitesOff] });
  return { on, off };
}
