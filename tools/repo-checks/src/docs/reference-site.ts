import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { entriesOf } from '@nexusdi/doc-examples/package-exports';
import { workspaceRoot } from '@nx/devkit';

import type { SurfacePackage } from './api-surface';
import {
  loadLibraries,
  loadReferenceOptions,
  loadRegionExpander,
} from './loaders';
import { CONTENT } from './paths';
import { parsePage, readSite, type DocsPage } from './site';

/**
 * The docs site as the reference-page guards read it (`doc-export-coverage`,
 * `doc-option-keys` and `doc-overloads`): each page expanded the way the
 * build expands it, and the libraries those pages document.
 */

/** The fence opening a block, as the region loader and this file read one. */
const FENCE = /^(\s*)(`{3,})(.*)$/;

/**
 * The page's source with its regions and reference directives expanded, as
 * the build expands them, and each fence the author wrote as executable
 * marked so.
 *
 * The region loader turns `ts file=… region=…` into a plain `ts`, so a
 * fence the package's own tests run looks, after expansion, like a fence
 * nothing checks. Expansion fills bodies and neither adds nor removes a
 * fence, so the written and the expanded fences pair by position, and each
 * expanded opener whose written twin carried `twoslash` or `file=` gains an
 * `executed` word. The reference loader runs after, and every fence it emits
 * is `ts twoslash`; each entry's signature block is dropped, since a
 * signature names its export and its option keys without calling or
 * explaining any of them.
 */
function expandedPage(
  path: string,
  expandRegions: (source: string, root: string, file: string) => string,
  expandReferences: (source: string) => string,
): string {
  const raw = readFileSync(path, 'utf8');
  const expanded = expandRegions(raw, workspaceRoot, path);
  const openers = (text: string) => {
    const found: number[] = [];
    let open = false;
    text.split('\n').forEach((line, at) => {
      if (!FENCE.test(line)) return;
      if (!open) found.push(at);
      open = !open;
    });
    return found;
  };
  const writtenLines = raw.split('\n');
  const expandedLines = expanded.split('\n');
  const written = openers(raw);
  const opened = openers(expanded);
  if (written.length !== opened.length)
    throw new Error(
      `${path}: expanding regions changed the fence count from ${written.length} to ${opened.length}`,
    );
  written.forEach((line, at) => {
    const info = (FENCE.exec(writtenLines[line] ?? '')?.[3] ?? '').trim();
    if (/(^|\s)(twoslash|file=)/.test(info)) {
      const target = opened[at] as number;
      expandedLines[target] = `${expandedLines[target]} executed`;
    }
  });
  return expandReferences(expandedLines.join('\n')).replace(
    /<div className="[\w-]+-api-entry__signature">[\s\S]*?<\/div>/g,
    '',
  );
}

/**
 * Every page of `apps/docs/content`, expanded by `expandedPage`. `keep`
 * picks the pages to expand by their unexpanded parse; the rest come back
 * unexpanded.
 */
export async function readReferenceSite(
  keep: (page: DocsPage) => boolean = () => true,
): Promise<DocsPage[]> {
  const expandRegions = await loadRegionExpander();
  const options = await loadReferenceOptions();
  const { expandReferences } =
    await import('@nexusdi/doc-examples/mdx-reference-loader');
  return readSite(CONTENT).map((page) =>
    keep(page)
      ? parsePage(
          page.file,
          page.slug,
          expandedPage(
            join(workspaceRoot, page.file),
            expandRegions,
            (source) =>
              expandReferences(source, workspaceRoot, page.file, options),
          ),
        )
      : page,
  );
}

/** A package's name and the source file of each entry, from its package file. */
export function surfacePackageOf(packageJson: string): SurfacePackage {
  const { name } = JSON.parse(readFileSync(packageJson, 'utf8')) as {
    name: string;
  };
  return {
    name,
    entries: new Map(
      entriesOf(packageJson).map(({ specifier, file }) => [specifier, file]),
    ),
  };
}

/** Every library that publishes an entry, with each entry's source file. */
export async function surfacePackages(): Promise<SurfacePackage[]> {
  return (await loadLibraries())(workspaceRoot).map((library) =>
    surfacePackageOf(join(workspaceRoot, library.root, 'package.json')),
  );
}

/**
 * The packages whose error classes the reference guards exempt, each with
 * its reason.
 */
export const ERROR_EXEMPT: ReadonlyMap<string, string> = new Map([
  // An error class is documented by its code's page under /errors/, which
  // /api-errors/ lists (spec section 22, item 9), in core and in every
  // first-party package that raises one.
  ...[
    '@nexusdi/core',
    '@nexusdi/decorators',
    '@nexusdi/devtools',
    '@nexusdi/federation',
    '@nexusdi/interceptors',
    '@nexusdi/react',
    '@nexusdi/testing',
  ].map((name): [string, string] => [
    name,
    'Each error class has a code page under /errors/, and /api-errors/ lists them.',
  ]),
  // A web adapter's one error class is the one it hands its framework, and
  // only the adapter constructs it.
  ...[
    '@nexusdi/express',
    '@nexusdi/fastify',
    '@nexusdi/hono',
    '@nexusdi/react-router',
  ].map((name): [string, string] => [
    name,
    'NexusHttpError carries no code: its cause is the NexusDI error, whose code has a page under /errors/.',
  ]),
]);

/**
 * The one reference page of a package, found by its `package` frontmatter,
 * the first by file name when there are two. G10 reports a missing page and
 * a second one, so the other guards take the page and say nothing.
 */
export function referencePageOf(
  pages: readonly DocsPage[],
  name: string,
): DocsPage | undefined {
  return pages
    .filter(
      (page) =>
        page.kind === 'reference' && page.frontmatter['package'] === name,
    )
    .sort((left, right) => left.file.localeCompare(right.file))[0];
}

/** The name a `##` heading spells: `` `make` `` and `` `make()` `` both name `make`. */
export const headingName = (text: string): string =>
  text.replace(/`/g, '').split(/[(<\s]/)[0] ?? '';

/**
 * The 0-based lines of a fence body a reader does not see: everything above
 * its last `// ---cut---`, each `// ---cut-start---` to `// ---cut-end---`
 * block, and everything from a `// ---cut-after---` down, the markers
 * included.
 */
export function hiddenLines(body: string): Set<number> {
  const lines = body.split('\n').map((line) => line.trim());
  const hidden = new Set<number>();
  const cut = lines.lastIndexOf('// ---cut---');
  for (let at = 0; at <= cut; at += 1) hidden.add(at);
  let inBlock = false;
  let after = false;
  lines.forEach((line, at) => {
    if (line === '// ---cut-start---') inBlock = true;
    if (line === '// ---cut-after---') after = true;
    if (inBlock || after) hidden.add(at);
    if (line === '// ---cut-end---') inBlock = false;
  });
  return hidden;
}

/** Whether a fence is one the repository compiles or runs. */
export const executable = (meta: string, lang: string): boolean =>
  /(^|\s)(twoslash|executed)(\s|$)/.test(`${lang} ${meta}`) ||
  /(^|\s)file=/.test(meta);
