import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { mapFences } from './fences.mjs';
import {
  RUNTIME_GLOBALS_FILE,
  compilerOptionsFor,
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

/** A fence's compiler options as the `// @` flags Twoslash reads. */
function optionLines(options) {
  return Object.entries(options).map(
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
 *
 * The options are the site's, with the override of every first-party package
 * the fence imports (`compilerOptionsFor`). A fence with the `dom` lib gets no
 * runtime globals file: `lib.dom.d.ts` declares every name in it.
 */
export function withPrelude(code) {
  const options = compilerOptionsFor(code);
  const dom = Array.isArray(options.lib) && options.lib.includes('dom');
  return [
    ...optionLines(options),
    ...(dom
      ? []
      : [
          '// @filename: runtime-globals.d.ts',
          readFileSync(RUNTIME_GLOBALS_FILE, 'utf8').trimEnd(),
        ]),
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

  return mapFences(
    source,
    ({ info, opener, body, closer }) =>
      TWOSLASH.has(info.trim())
        ? [opener, ...withPrelude(body.join('\n')).split('\n'), closer]
        : [opener, ...body, closer],
    FENCE,
  );
}
