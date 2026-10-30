/**
 * Bundles core twice from source with the same esbuild options. The `off`
 * build serves hook-sites.ts with HOOK_SITES false, so it differs from the
 * `on` build only in the hook sites (spec 17.3).
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

/**
 * Serves lookup.ts with a serial Math.imul chain at the `canon` site of
 * getFrom. Only the planted on build carries it. The chain length is read
 * at run time from the bundle URL (`planted.mjs?k14spin=N`), so a planted and
 * a clean worker run the same code and differ in N alone.
 */
const SITE = 'const key = HOOK_SITES ? container.root.canon(token) : token;';
const plant = {
  name: 'plant-canon-cost',
  setup(b) {
    b.onLoad({ filter: /[/\\]runtime[/\\]lookup\.ts$/ }, async (args) => {
      const source = readFileSync(args.path, 'utf8');
      if (!source.includes(SITE))
        throw new Error('lookup.ts no longer holds the canon site to plant in');
      const spin = `
const K14_SPIN = Number(new URL(import.meta.url).searchParams.get('k14spin') ?? 0);
let k14Sink = 0;
function k14Spin(): void {
  let x = 1;
  for (let i = 0; i < K14_SPIN; i++) x = Math.imul(x, 31) + i;
  k14Sink = x;
}
`;
      return {
        contents: source.replace(SITE, 'k14Spin();\n  ' + SITE) + spin,
        loader: 'ts',
        resolveDir: dirname(args.path),
      };
    });
  },
};

const common = {
  entryPoints: [ENTRY],
  bundle: true,
  format: 'esm',
  platform: 'node',
  minifySyntax: true,
  logLevel: 'error',
};

/** The `on` build with the plant, for the sensitivity check (sensitivity.mjs). */
export async function buildPlanted(outDir) {
  mkdirSync(outDir, { recursive: true });
  const planted = join(outDir, 'planted.mjs');
  await build({ ...common, outfile: planted, plugins: [plant] });
  return planted;
}

export async function buildDispatch(outDir) {
  mkdirSync(outDir, { recursive: true });
  const on = join(outDir, 'on.mjs');
  const off = join(outDir, 'off.mjs');
  await build({ ...common, outfile: on });
  await build({ ...common, outfile: off, plugins: [hookSitesOff] });
  return { on, off };
}
