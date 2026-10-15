import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { examplesFilesIn } from '@nexusdi/doc-examples/examples-file';
import { readPreamble, withPreamble } from '@nexusdi/doc-examples/preamble';
import { createTwoslasher } from 'twoslash';

import { loadMdSiblings, loadReferenceOptions } from './loaders';
import { parsePage, type DocsPage } from './site';

/** One fence the compiler reads, named by the file and line it opens on. */
export interface TwoslashFence {
  page: string;
  lang: string;
  meta: string;
  code: string;
}

/** The markdown fences of one package file, and where they compile from. */
export interface MarkdownFile {
  /** The package root, workspace relative: `libs/core`. */
  root: string;
  /** The file, workspace relative. */
  file: string;
  /** The file's directory, which a relative import in a fence resolves from. */
  dir: string;
  fences: TwoslashFence[];
}

const ERRORS = /^\s*\/\/\s*@errors:\s*(.+)$/m;
const QUERY = /^\s*\/\/\s*\^\?\s*$/;
const DOCTESTED = '@import.meta.vitest';

/** Every fence whose info string names `twoslash`, as a page carries it. */
export function twoslashFences(pages: DocsPage[]): TwoslashFence[] {
  return pages.flatMap((page) =>
    page.fences
      .filter((fence) => fence.meta.split(/\s+/).includes('twoslash'))
      .map((fence) => ({
        page: `${page.file}:${fence.line}`,
        lang: fence.lang,
        meta: fence.meta,
        code: fence.body,
      })),
  );
}

/**
 * Every content page with its regions and references expanded, read through
 * `md-siblings`, which runs both expansions the way the build runs them. A
 * finding names the page's `.md` sibling, and its line is a line of the
 * expanded text.
 */
export async function contentFences(
  contentDir: string,
  root: string,
): Promise<TwoslashFence[]> {
  const mdSiblings = await loadMdSiblings();
  const siblings = mdSiblings(contentDir, root, await loadReferenceOptions());
  const base = relative(root, contentDir);

  return twoslashFences(
    [...siblings].map(([route, markdown]) =>
      parsePage(`${base}/${route}`, route.replace(/\.md$/, ''), markdown),
    ),
  );
}

/**
 * Nextra's `rehype-twoslash-popup` imports `Popup` only for a fence whose meta
 * is exactly `twoslash`, while the transformer highlights any meta naming it.
 * A fence between the two renders hover markup with no `Popup` behind it.
 */
export function checkMeta(fences: TwoslashFence[]): string[] {
  return fences
    .filter(({ meta }) => meta !== 'twoslash')
    .map(
      ({ page, meta }) =>
        `${page}: the fence meta is '${meta}'. Nextra imports Popup only for a meta of exactly 'twoslash', and MDX throws on the missing component. Drop the other words.`,
    );
}

/**
 * The theme draws a persisted query in an absolutely positioned popup, so the
 * popup covers the line after it. A query is the last line of its fence, which
 * also limits a fence to one.
 */
export function checkQueries(fences: TwoslashFence[]): string[] {
  return fences
    .filter(({ code }) => {
      const lines = code.trimEnd().split('\n');
      return lines.some(
        (line, index) => QUERY.test(line) && index !== lines.length - 1,
      );
    })
    .map(
      ({ page }) =>
        `${page}: a ^? query sits above the last line, and its popup covers the line below it. End the fence on its one query.`,
    );
}

/**
 * One line per fence that fails to compile under the prelude, or that
 * declares an error the compiler no longer reports.
 *
 * Twoslash throws on an error the fence's `// @errors:` does not name, and
 * says nothing about a named error that stopped occurring, so this checks that
 * direction itself. `vfsRoot` is where a relative import resolves from.
 */
export function compileFailures(
  fences: TwoslashFence[],
  withPrelude: (code: string) => string,
  vfsRoot?: string,
): string[] {
  const twoslasher = createTwoslasher(vfsRoot ? { vfsRoot } : {});
  const failures: string[] = [];

  for (const { page, lang, code } of fences) {
    const declared = (code.match(ERRORS)?.[1] ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);

    let produced: number[];
    try {
      // An error with no code becomes NaN and matches no declared code, so a
      // declared code that stopped occurring still fails.
      produced = twoslasher(
        withPrelude(code),
        lang === 'tsx' ? 'tsx' : 'ts',
      ).errors.map((error) => Number(error.code));
    } catch (error) {
      failures.push(`${page}: does not compile: ${(error as Error).message}`);
      continue;
    }

    for (const each of declared) {
      if (!produced.includes(each)) {
        failures.push(
          `${page}: declares @errors: ${each}, which the compiler no longer reports. Remove the code, or restore the error it names.`,
        );
      }
    }
  }

  return failures;
}

/**
 * Every `libs/*` package whose `exports` map holds an entry other than
 * `./package.json`, workspace relative. `apps/docs/tools/libraries.mjs` takes
 * this list over when it arrives.
 */
function libraryRoots(root: string): string[] {
  return readdirSync(join(root, 'libs'))
    .map((name) => join('libs', name))
    .filter((dir) => {
      const manifest = join(root, dir, 'package.json');
      if (!existsSync(manifest)) return false;
      const { exports = {} } = JSON.parse(readFileSync(manifest, 'utf8')) as {
        exports?: Record<string, unknown>;
      };
      return Object.keys(exports).some((key) => key !== './package.json');
    })
    .sort();
}

/**
 * The doctested `ts` and `tsx` fences of every library's example files, each
 * with the package preamble the docs site puts in front of it. The package's
 * test run executes these fences and never type-checks them.
 */
export function markdownFences(root: string): MarkdownFile[] {
  return libraryRoots(root).flatMap((packageRoot) => {
    const packageDir = join(root, packageRoot);
    const preamble = readPreamble(packageDir);

    return examplesFilesIn(packageDir)
      .filter((file) => existsSync(file))
      .map((file) => {
        const path = relative(root, file);
        const page = parsePage(path, '', readFileSync(file, 'utf8'));

        return {
          root: packageRoot,
          file: path,
          dir: dirname(file),
          fences: page.fences
            .filter(
              (fence) =>
                ['ts', 'tsx'].includes(fence.lang) &&
                fence.meta.split(/\s+/).includes(DOCTESTED),
            )
            .map((fence) => ({
              page: `${path}:${fence.line}`,
              lang: fence.lang,
              meta: fence.meta,
              code: withPreamble(preamble, fence.body),
            })),
        };
      });
  });
}
