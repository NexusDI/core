import { relative } from 'node:path';

import { workspaceRoot } from '@nx/devkit';

import { waits } from './allowance';
import { CONTENT } from './paths';
import type { DocsPage } from './site';

/**
 * G2: the floor pages and the named concept pages exist with the right kind.
 *
 * A page not yet written sits in `doc-floor-allowance.json` with the reason it
 * waits, and the entry fails once the page exists.
 */
export function checkFloor(input: {
  pages: DocsPage[];
  floor: Record<string, string>;
  concepts: readonly string[];
  allowance: Record<string, string>;
}): string[] {
  const { pages, floor, concepts, allowance } = input;
  // A folder's index answers to the folder: errors/index.mdx is `errors`.
  const bySlug = new Map(
    pages.map((page) => [page.slug.replace(/\/index$/, ''), page]),
  );
  const required: [string, string, string][] = [
    ...Object.entries(floor).map(
      ([slug, kind]) => [slug, kind, 'floor'] as [string, string, string],
    ),
    ...concepts.map(
      (slug) => [slug, 'concept', 'concept'] as [string, string, string],
    ),
  ];
  const findings: string[] = [];
  const file = (slug: string) =>
    relative(workspaceRoot, `${CONTENT}/${slug}.mdx`);

  for (const [slug, kind, role] of required) {
    const page = bySlug.get(slug);

    if (page === undefined) {
      if (slug in allowance) continue;
      findings.push(
        `${file(slug)}: the ${role} page '${slug}' does not exist. Write it with kind: ${kind}, or record the wait in doc-floor-allowance.json.`,
      );
      continue;
    }

    if (page.kind !== kind) {
      findings.push(
        `${file(slug)}: the ${role} page '${slug}' has kind '${String(page.kind)}'. Set kind: ${kind}.`,
      );
    }
  }

  const { stale, unexplained } = waits(new Set(bySlug.keys()), allowance);
  for (const slug of unexplained) {
    findings.push(
      `doc-floor-allowance.json: '${slug}' records no reason. Say what the page waits for.`,
    );
  }
  for (const slug of stale) {
    findings.push(
      `doc-floor-allowance.json: '${slug}' exists now. Remove the entry.`,
    );
  }

  return findings.sort();
}
