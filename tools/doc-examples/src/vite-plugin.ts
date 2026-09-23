import type { Plugin } from 'vite';

import { rewriteJsDoc, rewriteMarkdown } from './expect-comments.ts';

/**
 * Turns the READMEs' `// -> value` claims into assertions before
 * vite-plugin-doctest extracts the code around them.
 *
 * `enforce: 'pre'` is what puts it there. doctest reads the file as written,
 * so by the time its own transform runs the claims must already be
 * assertions.
 */
export function expectComments(): Plugin {
  return {
    name: 'nexusdi:expect-comments',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0] as string;

      if (file.endsWith('.md')) return rewriteMarkdown(code, file);
      if (/\.[cm]?tsx?$/.test(file)) return rewriteJsDoc(code, file);

      return null;
    },
  };
}
