import { waits } from './allowance';
import type { DocsPage } from './site';

export interface Commitment {
  /** The line of `specs/2026-09-23-core-0.4-design.md` at b5ab435 that makes the promise. */
  line: number;
  commitment: string;
  targets: {
    page: string;
    heading: string | null;
    level: 2 | 3;
    coveredBy?: string;
  }[];
}

/**
 * Every promise core spec makes about the docs has its heading on its page
 * (spec section 4.5). The guard keys on headings, so an edit to the core spec
 * that moves a line moves nothing here. A target with a null heading is held by
 * the page's existence, or by the guard `coveredBy` names.
 */
export function checkCommitments(input: {
  rows: Commitment[];
  pages: DocsPage[];
  allowance: Record<string, string>;
}): string[] {
  const { rows, pages, allowance } = input;
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  const findings: string[] = [];

  for (const row of rows) {
    for (const target of row.targets) {
      const page = bySlug.get(target.page);
      if (page === undefined) {
        if (!(target.page in allowance)) {
          findings.push(
            `commitments.json line ${row.line}: the page '${target.page}' does not exist. Write it, or record the wait in doc-commitments-allowance.json.`,
          );
        }
        continue;
      }
      if (target.heading === null) continue;

      const found = page.headings.some(
        (heading) =>
          heading.depth === target.level && heading.text === target.heading,
      );
      if (!found) {
        findings.push(
          `commitments.json line ${row.line}: '${target.page}' has no ${'#'.repeat(target.level)} heading '${target.heading}'. Core spec line ${row.line} promises it.`,
        );
      }
    }
  }

  const { stale, unexplained } = waits(new Set(bySlug.keys()), allowance);
  for (const slug of unexplained)
    findings.push(
      `doc-commitments-allowance.json: '${slug}' records no reason. Say what the page waits for.`,
    );
  for (const slug of stale)
    findings.push(
      `doc-commitments-allowance.json: '${slug}' exists now. Remove the entry.`,
    );

  return findings.sort();
}
