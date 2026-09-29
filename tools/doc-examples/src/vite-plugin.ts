import type { Plugin } from 'vite';

import { rewriteJsDoc, rewriteMarkdown } from './expect-comments.ts';

/**
 * The specifiers of the static imports expectComments turned into dynamic
 * ones, by README file.
 */
export type DoctestImports = Map<string, ReadonlySet<string>>;

/**
 * Turns the READMEs' `// -> value` claims into assertions before
 * vite-plugin-doctest extracts the code around them.
 *
 * `enforce: 'pre'` is what puts it there. doctest reads the file as written,
 * so by the time its own transform runs the claims must already be
 * assertions.
 *
 * It records each README's rewritten imports in `imports`, for doctestPreload.
 */
export function expectComments(imports: DoctestImports): Plugin {
  return {
    name: 'nexusdi:expect-comments',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0] as string;

      if (file.endsWith('.md')) {
        const specifiers = new Set<string>();
        const rewritten = rewriteMarkdown(code, file, (specifier) =>
          specifiers.add(specifier),
        );

        imports.set(file, specifiers);
        return rewritten;
      }
      if (/\.[cm]?tsx?$/.test(file)) return rewriteJsDoc(code, file);

      return null;
    },
  };
}

/**
 * Loads the modules a README's doctests import before its first test starts.
 *
 * expectComments turns each static import into a dynamic one inside the test
 * body, so the first test to run pays for transforming the imported package's
 * whole source graph within vitest's per-test timeout. This appends a
 * top-level import of each specifier, which vitest loads while it collects the
 * file, with no timeout, as ESM loads any static import before the module
 * runs. The tests then receive the modules from vitest's cache. A dynamic
 * import the README writes itself stays lazy.
 *
 * It must come after vite-plugin-doctest in the plugin list, since doctest
 * turns every line after the last block into a comment.
 */
export function doctestPreload(imports: DoctestImports): Plugin {
  return {
    name: 'nexusdi:doctest-preload',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0] as string;
      const specifiers = file.endsWith('.md') ? imports.get(file) : undefined;

      if (specifiers === undefined || specifiers.size === 0) return null;

      const preload = [...specifiers]
        .map((specifier) => `import ${JSON.stringify(specifier)};`)
        .join(' ');

      // One appended line moves no existing line, so `map: null` keeps the
      // doctest source map as it is.
      return { code: `${code}\n${preload}`, map: null };
    },
  };
}
