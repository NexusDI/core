import type { DocsPage } from './site';

const REFERENCE = /(?:^|\s)file=(\S+)\s+region=([\w-]+)/;

/**
 * Every page has a `.md` sibling, each sibling carries the code of every
 * region its page cites, and no sibling keeps a reference directive: the
 * sibling is the page after expansion, posts included.
 */
export function checkSiblings(input: {
  pages: DocsPage[];
  siblings: Map<string, string>;
  regionCode: (path: string, name: string) => string;
}): string[] {
  const { pages, siblings, regionCode } = input;
  const findings: string[] = [];

  for (const page of pages) {
    const route = `${page.slug}.md`;
    const sibling = siblings.get(route);

    if (sibling === undefined) {
      findings.push(
        `${route}: no sibling was written for ${page.file}. The .md sibling of every page is part of the agent surface (standard section 5a).`,
      );
      continue;
    }

    for (const fence of page.fences) {
      const match = REFERENCE.exec(fence.meta);
      if (!match) continue;
      const [, path = '', name = ''] = match;
      if (!sibling.includes(regionCode(path, name).trim())) {
        findings.push(
          `${route}: lacks the code of region '${name}' from ${path}. Write siblings after region expansion, as md-siblings.mjs does.`,
        );
      }
    }

    if (/<!--\s*reference\s/.test(sibling)) {
      findings.push(
        `${route}: still holds a reference directive. Write siblings after reference expansion.`,
      );
    }
  }

  return findings.sort();
}
