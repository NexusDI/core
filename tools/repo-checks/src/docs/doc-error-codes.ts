import { parse } from '../core-layers';
import { declaredCodes } from '../error-codes';
import { libPackages } from '../entry-graph';

import { waits } from './allowance';
import { linksOf } from './doc-links';
import type { DocsPage } from './site';

/** Every code a package under `libsDir` declares in NexusErrorByCode, with that package. */
export function codesByPackage(
  libsDir: string,
  manifestFile = 'package.json',
): Map<string, string> {
  const codes = new Map<string, string>();
  for (const { name, files } of libPackages(libsDir, manifestFile))
    for (const code of declaredCodes(parse(files))) codes.set(code, name);
  return codes;
}

/**
 * Amendment A3: one code page per declared code, naming its package; no
 * page for an undeclared code; `/api-errors/` links every code page.
 */
export function checkErrorCodes(input: {
  pages: DocsPage[];
  codes: Map<string, string>;
  allowance: Record<string, string>;
}): string[] {
  const { pages, codes, allowance } = input;
  const findings: string[] = [];
  const codePages = new Map(
    pages
      .filter(
        (page) =>
          page.slug.startsWith('errors/') && page.slug !== 'errors/index',
      )
      .map((page) => [page.slug.slice('errors/'.length), page]),
  );

  for (const [code, page] of codePages) {
    const owner = codes.get(code);
    if (owner === undefined) {
      findings.push(
        `${page.file}: ${code} is declared by no package under libs/. Remove the page, or declare the code in NexusErrorByCode.`,
      );
    } else if (page.frontmatter.package !== owner) {
      findings.push(
        `${page.file}: package '${String(page.frontmatter.package)}', and ${owner} declares ${code}. Name the declaring package.`,
      );
    }
  }

  for (const [code, owner] of codes) {
    if (codePages.has(code) || code in allowance) continue;
    findings.push(
      `apps/docs/content/errors/${code}.mdx: ${owner} declares ${code}, which has no page. Every error message links to /errors/${code} (spec section 3.3).`,
    );
  }

  const index = pages.find((page) => page.slug === 'api-errors');
  if (index !== undefined) {
    const linked = new Set(linksOf(index));
    for (const code of codePages.keys()) {
      if (!linked.has(`/errors/${code}/`)) {
        findings.push(
          `${index.file}: links no page for ${code}. List every code page.`,
        );
      }
    }
  }

  const { stale, unexplained } = waits(new Set(codePages.keys()), allowance);
  for (const code of unexplained)
    findings.push(
      `doc-error-codes-allowance.json: '${code}' records no reason. Say what the page waits for.`,
    );
  for (const code of stale)
    findings.push(
      `doc-error-codes-allowance.json: '${code}' exists now. Remove the entry.`,
    );
  for (const code of Object.keys(allowance))
    if (!codes.has(code))
      findings.push(
        `doc-error-codes-allowance.json: '${code}' is declared by no package. Remove the entry.`,
      );

  return findings.sort();
}
