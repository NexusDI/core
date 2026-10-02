import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { filesUnder } from '@nexusdi/doc-examples/files-under';
import { workspaceRoot } from '@nx/devkit';

import { waits } from './allowance';
import { stripFences, type DocsPage, type MetaEntry } from './site';

const MARKDOWN = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const HREF = /\bhref=(?:"([^"]+)"|'([^']+)'|\{\s*['"]([^'"]+)['"]\s*\})/g;
const README =
  /^https?:\/\/github\.com\/NexusDI\/core(?:\/(?:blob|tree)\/[^/]+(?:\/[^#?]*)?README[^#?]*|\/?#readme)/i;

/** A file that writes links and the targets it writes. */
export interface LinkSource {
  file: string;
  links: string[];
}

const hrefs = (text: string): string[] =>
  [...text.matchAll(HREF)].map(
    (match) => (match[1] ?? match[2] ?? match[3]) as string,
  );

/** Every link target in the page's prose and JSX, fences excluded. */
export function linksOf(page: DocsPage): string[] {
  const body = stripFences(page.body);
  return [
    ...[...body.matchAll(MARKDOWN)].map((match) => match[1] as string),
    ...hrefs(body),
  ];
}

/**
 * The links the app emits outside the content tree: the `href` of every
 * component and route file under `dirs` (tests excluded), and the `href` of
 * every `_meta.ts` entry. The release notice's link to `/release-candidate/`
 * is one of them.
 */
export function emittedLinks(
  dirs: readonly string[],
  meta: readonly MetaEntry[] = [],
): LinkSource[] {
  const sources: LinkSource[] = dirs
    .flatMap((dir) =>
      filesUnder(
        dir,
        (name) => /\.(?:tsx|jsx)$/.test(name) && !/\.test(?:-d)?\./.test(name),
      ),
    )
    .map((path) => ({
      file: relative(workspaceRoot, path),
      links: hrefs(readFileSync(path, 'utf8')),
    }));

  const fromMeta = meta.flatMap((entry) => {
    const { href } = (entry.value ?? {}) as { href?: unknown };
    return typeof href === 'string' ? [href] : [];
  });
  if (fromMeta.length > 0) {
    sources.push({ file: 'apps/docs/content/_meta.ts', links: fromMeta });
  }

  return sources.filter((source) => source.links.length > 0);
}

/** The mission ids under `apps/docs/academy/`, one per folder holding a `mission.ts`. */
export function missionIds(academyDir: string): string[] {
  if (!existsSync(academyDir)) return [];
  return readdirSync(academyDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(academyDir, entry.name, 'mission.ts')),
    )
    .map((entry) => entry.name)
    .sort();
}

function routeOf(slug: string): string {
  if (slug === 'index') return '/';
  if (slug.endsWith('/index')) return `/${slug.slice(0, -'/index'.length)}/`;
  return `/${slug}/`;
}

/**
 * G7: every root-relative link names a page or an app route, none hard-codes
 * `/next/`, and none sends a reader to a README the site already documents.
 * `emitted` carries the links that components and `_meta.ts` write.
 */
export function checkLinks(input: {
  pages: DocsPage[];
  toolRoutes: readonly string[];
  missions: readonly string[];
  pending: Record<string, string>;
  emitted?: readonly LinkSource[];
}): string[] {
  const { pages, toolRoutes, missions, pending, emitted = [] } = input;
  const routes = new Set([
    ...pages.map((page) => routeOf(page.slug)),
    ...toolRoutes,
  ]);
  const siblings = new Set(pages.map((page) => `/${page.slug}.md`));
  const findings: string[] = [];
  const sources: LinkSource[] = [
    ...pages.map((page) => ({ file: page.file, links: linksOf(page) })),
    ...emitted,
  ];

  for (const { file, links } of sources) {
    for (const link of new Set(links)) {
      if (README.test(link)) {
        findings.push(
          `${file}: '${link}' links to a NexusDI README on GitHub. Link to the page on this site that documents the same thing.`,
        );
        continue;
      }
      if (!link.startsWith('/') || link.startsWith('//')) continue;

      if (link === '/next' || link.startsWith('/next/')) {
        findings.push(
          `${file}: '${link}' hard-codes the /next base path. Write '${link.slice('/next'.length) || '/'}'; Next adds the base path, and the link keeps working after the swap at 0.4.0 final.`,
        );
        continue;
      }

      const path = link.split('#')[0]?.split('?')[0] ?? '';
      if (siblings.has(path)) continue;

      const route = path.endsWith('/') ? path : `${path}/`;
      const mission = /^\/academy\/([^/]+)\/$/.exec(route)?.[1];

      if (mission !== undefined && mission !== 'progress') {
        if (!missions.includes(mission)) {
          findings.push(
            `${file}: '${link}' names no mission. The missions are ${missions.join(', ') || 'none yet'}.`,
          );
        }
        continue;
      }

      if (!routes.has(route) && !(route in pending)) {
        findings.push(
          `${file}: '${link}' names no content page or tool route.`,
        );
      }
    }
  }

  const { stale, unexplained } = waits(routes, pending);
  for (const route of unexplained) {
    findings.push(
      `doc-links-allowance.json: '${route}' records no reason. Say what the route waits for.`,
    );
  }
  for (const route of stale) {
    findings.push(
      `doc-links-allowance.json: '${route}' exists now. Remove the entry.`,
    );
  }

  return findings.sort();
}
