import { defaultServerConditions } from 'vite';
import { doctest } from 'vite-plugin-doctest';

import { expectComments } from './vite-plugin.ts';

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
  return {
    // `expectComments` is enforce: 'pre', so a `// -> value` claim has already
    // become an assertion by the time doctest extracts the block around it.
    plugins: [
      expectComments(),
      doctest({ markdown: { preamble: options.preamble ?? '' } }),
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
 * The files doc examples are collected from.
 *
 * Specs are excluded: a file matching both `include` and `includeSource` is
 * collected twice.
 */
export function docExampleSources(extension = 'ts'): string[] {
  return [`src/**/!(*.spec|*.test|*.test-d).${extension}`, 'README.md'];
}
