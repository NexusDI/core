import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The lines a package's README examples may use without writing them out.
 *
 * A README keeps its one-line examples one line long by importing once at the
 * top and letting the later blocks stand on that import. Two systems then have
 * to agree on what those blocks may assume: `vite-plugin-doctest`, which runs
 * every block as a test, and the docs app's region loader, which lifts a block
 * onto a page where Twoslash compiles it. They read the same file, so a name
 * that resolves under one resolves under the other.
 *
 * The file sits beside the README it serves, because the README's directory is
 * all either side knows. The doctest run has `import.meta.dirname` of the
 * package's `vite.config.ts` and the loader has a `file=` path pointing at the
 * README.
 *
 *     // libs/urn/doc-examples.preamble.ts
 *     import { URN } from '@nexusdi/core';
 *
 * It is a `.ts` file because the contents are TypeScript, and an editor
 * resolves the specifier and the names in it like any other source. A string
 * in a config or a field in `package.json` would get none of that.
 */
export const PREAMBLE_FILE = 'doc-examples.preamble.ts';

/** A package's preamble, or the empty string where it declares none. */
export function readPreamble(packageDir) {
  const path = join(packageDir, PREAMBLE_FILE);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/** Where `readPreamble` looks, so a caller can watch the file for changes. */
export function preamblePath(packageDir) {
  return join(packageDir, PREAMBLE_FILE);
}

/**
 * A block with the preamble in front of it, hidden from the rendered output.
 *
 * `// ---cut---` is Twoslash's directive to compile everything above it and
 * emit none of it, so the compiler resolves the names while the reader sees
 * the block the README shows and nothing more.
 *
 * A block that writes its own imports takes them over the preamble's, which is
 * the rule the doctest run already follows. Prepending here as well would
 * declare the same binding twice and the fence would fail to compile.
 */
export function withPreamble(preamble, code) {
  if (!preamble || /^import[\s{]/m.test(code)) return code;
  return `${preamble.replace(/\n*$/, '\n')}// ---cut---\n${code}`;
}
