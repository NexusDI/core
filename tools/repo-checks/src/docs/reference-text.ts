import type { DocsPage } from './site';

/**
 * What the reference-page guards ask of a page's text, with no file system
 * and no workspace: `doc-export-coverage` stays a pure check over the pages
 * it is given, and `doc-option-keys` and `doc-overloads` share the rules.
 */

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
