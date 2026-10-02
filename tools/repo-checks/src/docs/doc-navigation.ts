import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DOCS } from './paths';
import type { DocsPage, MetaEntry } from './site';

export interface NavigationModule {
  pageKinds: readonly string[];
  teachingKinds: readonly string[];
  floorPages: Record<string, string>;
  conceptPages: readonly string[];
  toolRoutes: readonly string[];
}

/** `apps/docs/app/navigation.ts`, imported by path so no project depends on the app. */
export async function loadNavigation(): Promise<NavigationModule> {
  return (await import(
    pathToFileURL(join(DOCS, 'app', 'navigation.ts')).href
  )) as NavigationModule;
}

/** A page's `_meta.ts` key: a folder's index answers to the folder. */
function keyOf(slug: string): string {
  return slug.endsWith('/index') ? slug.slice(0, -'/index'.length) : slug;
}

/** The page keys of one `_meta.ts` file, in order. */
function siblingsOf(key: string, meta: readonly MetaEntry[]): string[] {
  const parent = key.includes('/')
    ? key.slice(0, key.lastIndexOf('/') + 1)
    : '';
  return meta
    .filter((entry) => entry.page)
    .map((entry) => entry.key)
    .filter(
      (each) =>
        each.startsWith(parent) && !each.slice(parent.length).includes('/'),
    );
}

/**
 * G1: the sidebar and the content tree name the same pages. Each page has one
 * title and a known kind, and its `requires` names the pages right before it.
 */
export function checkNavigation(input: {
  pages: DocsPage[];
  meta: MetaEntry[];
  contentDir: string;
  kinds: readonly string[];
  teaching: readonly string[];
}): string[] {
  const { pages, meta, contentDir, kinds, teaching } = input;
  const findings: string[] = [];
  const keys = new Set(
    meta.filter((entry) => entry.page).map((entry) => entry.key),
  );
  const bySlug = new Map(pages.map((page) => [keyOf(page.slug), page]));

  for (const key of keys) {
    const present = ['.mdx', '.md', ''].some((extension) =>
      existsSync(join(contentDir, `${key}${extension}`)),
    );
    if (!present) {
      findings.push(
        `_meta.ts: the key '${key}' names no page. Write ${key}.mdx or remove the key.`,
      );
    }
  }

  for (const page of pages) {
    const key = keyOf(page.slug);
    const titles = page.headings.filter(
      (heading) => heading.depth === 1,
    ).length;

    if (!keys.has(key) && !keys.has(page.slug)) {
      findings.push(
        `${page.file}: the page is not a key in _meta.ts. Add '${key}' in its teaching position.`,
      );
    }
    if (titles !== 1) {
      findings.push(
        `${page.file}: has ${titles} "# " headings. A page has exactly one.`,
      );
    }
    if (page.kind === undefined || !kinds.includes(page.kind)) {
      findings.push(
        `${page.file}: kind '${String(page.kind)}' is not one of ${kinds.join(', ')}. Set a kind from spec section 4.2.`,
      );
    }

    const order = siblingsOf(key, meta);
    const at = order.indexOf(key);
    const before = order.slice(Math.max(0, at - 2), Math.max(0, at));
    const requires = Array.isArray(page.frontmatter.requires)
      ? (page.frontmatter.requires as unknown[]).map(String)
      : [];

    if (
      page.kind !== undefined &&
      teaching.includes(page.kind) &&
      requires.length === 0
    ) {
      const previous = bySlug.get(order[at - 1] ?? '');
      if (previous?.kind !== undefined && teaching.includes(previous.kind)) {
        findings.push(
          `${page.file}: follows the teaching page ${keyOf(previous.slug)} and carries no requires. Name it in requires.`,
        );
      }
    }

    if (requires.length > 2) {
      findings.push(
        `${page.file}: requires names ${requires.length} pages. Name one or two.`,
      );
    }

    for (const required of requires) {
      if (!before.includes(required)) {
        findings.push(
          `${page.file}: requires '${required}', which is not one of the two pages before it in _meta.ts (${before.join(', ') || 'none'}).`,
        );
        continue;
      }
      const target = bySlug.get(required);
      if (target?.kind === undefined || !teaching.includes(target.kind)) {
        findings.push(
          `${page.file}: requires '${required}', whose kind '${String(target?.kind)}' is not a teaching kind. A prerequisite is a tutorial or a concept.`,
        );
      }
    }
  }

  return findings.sort();
}
