import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  RUNTIME_GLOBALS_FILE,
  compilerOptions,
} from '../components/runtime/compiler-options.ts';

/**
 * Gives every `twoslash` fence the site's compiler options and runtime
 * globals, during `next build`.
 *
 * Nextra compiles a fence under Twoslash's own defaults, and those include no
 * `console`: a fence that logs fails with TS2584. This loader writes the
 * options of `compiler-options.ts` as Twoslash `// @` flags, then the runtime
 * globals as a file of their own, then the fence's code as `example.ts`. A
 * `// ---cut---` hides everything above the code.
 *
 * It is the first entry of the loader chain, and Turbopack runs that list from
 * the last entry to the first, so this runs over every fence the reference and
 * region loaders wrote.
 */

/** The options module, beside the globals; the build watches both. */
const COMPILER_OPTIONS_FILE = join(
  dirname(RUNTIME_GLOBALS_FILE),
  'compiler-options.ts',
);

const FENCE = /^(\s*)(`{3,})(.*)$/;
const TWOSLASH = new Set(['ts twoslash', 'tsx twoslash']);
const CUT = /^\s*\/\/\s*---cut---\s*$/m;

/** `compilerOptions` as the `// @` flags Twoslash reads. */
function optionLines() {
  return Object.entries(compilerOptions).map(
    ([name, value]) =>
      `// @${name}: ${Array.isArray(value) ? value.join(',') : value}`,
  );
}

/**
 * A fence's code with the prelude in front of it.
 *
 * A fence that already carries a `// ---cut---` keeps it as the one cut: the
 * region and reference loaders write one above a fence's hidden imports, and
 * a second cut here would cut nothing more.
 */
export function withPrelude(code) {
  return [
    ...optionLines(),
    '// @filename: runtime-globals.d.ts',
    readFileSync(RUNTIME_GLOBALS_FILE, 'utf8').trimEnd(),
    '// @filename: example.ts',
    ...(CUT.test(code) ? [] : ['// ---cut---']),
    code,
  ].join('\n');
}

/**
 * The loader entry point. Every line outside a `twoslash` fence passes
 * through.
 */
export default function mdxTwoslashPrelude(source) {
  this.addDependency(RUNTIME_GLOBALS_FILE);
  this.addDependency(COMPILER_OPTIONS_FILE);

  const out = [];
  let open = null;
  let body = [];

  for (const line of source.split('\n')) {
    const marker = line.match(FENCE);

    if (open === null) {
      out.push(line);
      if (marker) {
        open = { ticks: marker[2], twoslash: TWOSLASH.has(marker[3].trim()) };
        body = [];
      }
      continue;
    }

    if (marker && marker[2].startsWith(open.ticks) && marker[3].trim() === '') {
      out.push(
        ...(open.twoslash ? withPrelude(body.join('\n')).split('\n') : body),
      );
      out.push(line);
      open = null;
      continue;
    }

    body.push(line);
  }

  // An unclosed fence reaches the end of the page; MDX reports it.
  if (open !== null) out.push(...body);

  return out.join('\n');
}
