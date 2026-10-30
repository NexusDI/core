import { basename } from 'node:path';

import type { ExportInfo } from '@nexusdi/doc-examples/package-exports';

import { executable, headingName } from './reference-site';
import type { DocsPage } from './site';

/**
 * G10: every name a package publishes is documented, and every callable one
 * is documented by an example that runs.
 *
 * `doc-exports` checks the other direction: a fence naming a symbol is held
 * to the package's export list, so a rename cannot leave an example pointing
 * at nothing. Nothing there notices an export with no entry at all, which
 * ships exported, built and tested, with every target passing.
 *
 * Each library has one `kind: reference` page, found by its `package`
 * frontmatter (spec section 22, item 9). Documented is every export, a type
 * included: one `##` heading spelling the name, so a reader searching for it
 * lands on an anchor. Exercised is every export a caller can call or
 * construct, which the type checker answers through its call and construct
 * signatures, so a `const` holding an arrow function counts the way a
 * `function` does. A type and a plain value need the heading and nothing
 * more.
 *
 * An executable fence is a `twoslash` fence, which Nextra compiles, or a fence
 * the author wrote with `file=`, whose region the package's own tests run.
 * The caller marks the second kind `executed` after expanding the regions,
 * since expansion strips `file=`. A reference directive's example arrives as a
 * `twoslash` fence. Only the lines a reader sees count, so a name a preamble
 * imports above the last `// ---cut---` is not exercised by being imported.
 *
 * The allowance is the ratchet: it records the callables the pages do not
 * exercise yet, per package, and an entry that is no longer needed fails.
 */

export interface CoverageInput {
  pages: DocsPage[];
  packages: { name: string; entries: Map<string, ExportInfo[]> }[];
  /** Packages whose error classes are exempt, each with its reason. */
  exempt: ReadonlyMap<string, string>;
  allowance: Record<string, { unexercised: string[] }>;
}

/**
 * The page a package's reference lives on. Core and `@nexusdi/errors` take
 * the spec's own slugs (section 4.3): `/api/` and `/api-errors-package/`,
 * since `/api-errors/` lists the error codes.
 */
const SLUGS: Readonly<Record<string, string>> = {
  '@nexusdi/core': 'api',
  '@nexusdi/errors': 'api-errors-package',
};

const slugOf = (name: string): string =>
  SLUGS[name] ?? `api-${name.split('/').pop() ?? name}`;

/**
 * The lines of a fence a reader sees, those below its last `// ---cut---`,
 * with the import lines left out: an import names a symbol and calls nothing.
 */
function shown(body: string): string {
  const lines = body.split('\n');
  const cut = lines.map((line) => line.trim()).lastIndexOf('// ---cut---');
  return (cut === -1 ? lines : lines.slice(cut + 1))
    .filter((line) => !/^\s*import\b/.test(line))
    .join('\n');
}

/** Whether an identifier appears in code as a whole word. */
const names = (code: string, symbol: string): boolean =>
  new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(
    code,
  );

const isError = (each: ExportInfo): boolean =>
  each.error || each.name.endsWith('Error');

export function checkExportCoverage(input: CoverageInput): string[] {
  const findings: string[] = [];
  const unexercisedBy = new Map<string, Set<string>>();

  for (const { name, entries } of input.packages) {
    const pages = input.pages.filter(
      (page) =>
        page.kind === 'reference' && page.frontmatter['package'] === name,
    );
    if (pages.length === 0) {
      findings.push(
        `${name} has no reference page; add apps/docs/content/${slugOf(name)}.mdx with kind: reference and package: '${name}'`,
      );
      continue;
    }
    // Two pages still get the rest of the check, on the first by file name,
    // so a reader of the findings sees every defect at once.
    pages.sort((left, right) => left.file.localeCompare(right.file));
    if (pages.length > 1)
      findings.push(
        `${name} has two reference pages: ${pages
          .map((page) => basename(page.file))
          .join(' and ')}. A library has one.`,
      );

    const [page] = pages as [DocsPage];
    const file = basename(page.file);
    const headings = new Set(
      page.headings
        .filter((heading) => heading.depth === 2)
        .map((heading) => headingName(heading.text)),
    );
    const code = page.fences
      .filter((fence) => executable(fence.meta, fence.lang))
      .map((fence) => shown(fence.body))
      .join('\n');
    const exempt = input.exempt.has(name);
    const unexercised = new Set<string>();
    const seen = new Set<string>();

    for (const each of [...entries.values()].flat()) {
      if (each.name === 'default' || seen.has(each.name)) continue;
      seen.add(each.name);
      if (exempt && isError(each)) continue;

      if (!headings.has(each.name))
        findings.push(
          `${name} exports '${each.name}' and ${file} has no '## \`${each.name}\`' heading; add the entry with its reference directive`,
        );
      if (each.callable && !names(code, each.name)) unexercised.add(each.name);
    }

    unexercisedBy.set(name, unexercised);
    const allowed = new Set(input.allowance[name]?.unexercised ?? []);
    for (const symbol of [...unexercised].sort())
      if (!allowed.has(symbol))
        findings.push(
          `${name} exports '${symbol}', which no twoslash fence, file= fence or reference example= region on ${file} calls. A reader gets a signature and no example; add one, or record it in doc-export-coverage-allowance.json.`,
        );
  }

  for (const [name, entry] of Object.entries(input.allowance)) {
    const unexercised = unexercisedBy.get(name);
    if (!unexercised) {
      findings.push(
        `doc-export-coverage-allowance.json names ${name}, which is no library with a reference page; remove the entry`,
      );
      continue;
    }
    for (const symbol of entry.unexercised)
      if (!unexercised.has(symbol))
        findings.push(
          `${name}: '${symbol}' is exercised now; remove it from doc-export-coverage-allowance.json`,
        );
  }

  return findings;
}
