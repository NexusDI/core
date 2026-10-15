import { defaultServerConditions } from 'vite';
import { doctest } from 'vite-plugin-doctest';

import {
  type DoctestImports,
  doctestPreload,
  expectComments,
} from './vite-plugin.ts';
import { lowerDoctests } from './lower-doctests.ts';
import { moduleFences } from './module-fences.ts';

/**
 * The Vite configuration that makes a package's documented examples run.
 *
 * Every published package wires the same three things, so they live here rather
 * than in a copy per package.
 *
 * @example
 * ```ts
 * // libs/<package>/vite.config.ts
 * export default defineConfig(() => ({
 *   ...docExamples(),
 *   test: { includeSource: docExampleSources() },
 * }));
 * ```
 */
export function docExamples(options: { preamble?: string } = {}) {
  const imports: DoctestImports = new Map();

  return {
    // `expectComments` is enforce: 'pre', so a `// -> value` claim has already
    // become an assertion by the time doctest extracts the block around it.
    // `moduleFences` uncomments each `@module` fence at module level, and
    // `doctestPreload` appends the imports `expectComments` rewrote, both
    // after doctest has commented out the prose. `lowerDoctests` lowers the
    // result to Node 22.12, the floor every package promises.
    plugins: [
      expectComments(imports),
      doctest({ markdown: { preamble: options.preamble ?? '' } }),
      moduleFences(),
      lowerDoctests(),
      doctestPreload(imports),
    ],
    // A doc example imports the package by the specifier a reader would write.
    // `@nexusdi/source` is the condition tsconfig.base.json already resolves
    // through, so the example runs against src rather than requiring dist to
    // have been built first. Whether the built package resolves is a separate
    // question, and scripts/verify-packaging.mjs is what answers it.
    resolve: {
      conditions: ['@nexusdi/source', ...defaultServerConditions],
    },
    // Vitest runs in the ssr environment, where a bare specifier is resolved
    // with the externalConditions list rather than the one above.
    ssr: {
      resolve: {
        conditions: ['@nexusdi/source', ...defaultServerConditions],
        externalConditions: ['@nexusdi/source', ...defaultServerConditions],
      },
    },
  };
}

/**
 * The files doc examples are collected from: the package's sources, its
 * README, and the region files under `docs/` that the docs site imports.
 * A glob that matches nothing collects nothing, so a package without a
 * `docs/` folder needs no other config.
 *
 * Specs are excluded: a file matching both `include` and `includeSource` is
 * collected twice.
 */
export function docExampleSources(extension = 'ts'): string[] {
  return [
    `src/**/!(*.spec|*.test|*.test-d).${extension}`,
    'README.md',
    'docs/**/*.md',
  ];
}

/** Where a package's tests write the json report, under its package root. */
export const BEHAVIOUR_REPORT = './test-output/vitest/coverage/report.json';

/**
 * The reporters every package's tests run with: Vitest's default, and the
 * json report at `BEHAVIOUR_REPORT`, which `doc-behaviour-run.test.ts` holds
 * every sentence a reference entry renders against. The report sits inside
 * the test target's cached output.
 *
 * The return type is a tuple: a package whose spec typecheck reads its
 * `vite.config.ts` types `reporters` through Vitest, which refuses the wider
 * array an inline literal infers.
 *
 * @example
 * ```ts
 * // libs/<package>/vite.config.ts
 * test: { reporters: docReporters() },
 * ```
 */
export function docReporters(): ['default', ['json', { outputFile: string }]] {
  return ['default', ['json', { outputFile: BEHAVIOUR_REPORT }]];
}
