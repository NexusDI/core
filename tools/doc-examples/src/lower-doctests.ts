import { transform } from 'oxc-transform';
import type { Plugin } from 'vite';

/**
 * The Node every published package promises in `engines` (22.12). A doctest
 * fence runs as written, and a fence that uses syntax 22.12 lacks, such as
 * `using`, fails there.
 */
const DOCTEST_TARGET = 'node22.12';

/**
 * Lowers each transformed `.md` module to the floor Node, after doctest and
 * moduleFences have turned its fences into code. It calls oxc-transform
 * itself, so a leg that installs another Vite still lowers the same way.
 * Lowering `using` imports helpers from `@oxc-project/runtime`; both are
 * root dev dependencies pinned to the oxc version rolldown uses. The source
 * map chains to doctest's, so a failure still reports its README line.
 */
export function lowerDoctests(): Plugin {
  return {
    name: 'nexusdi:lower-doctests',
    enforce: 'pre',
    async transform(code, id) {
      if (!(id.split('?')[0] as string).endsWith('.md')) return null;
      const result = await transform(`${id}.ts`, code, {
        lang: 'ts',
        sourceType: 'module',
        target: DOCTEST_TARGET,
        sourcemap: true,
      });
      const [error] = result.errors;
      if (error) this.error(`${id}: ${error.message}`);
      return { code: result.code, map: result.map ?? null };
    },
  };
}
