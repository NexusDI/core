import type { DocsPage } from './site';

const PROSE_BUDGET = 1200;

// Each `<!--` drops the text up to the next `-->`. An opener with no `-->`
// after it drops only itself. A plain scan from left to right.
function withoutHtmlComments(text: string): string {
  let kept = '';
  let at = 0;
  for (;;) {
    const open = text.indexOf('<!--', at);
    if (open === -1) return kept + text.slice(at);
    kept += text.slice(at, open);
    const close = text.indexOf('-->', open + 4);
    if (close === -1) return kept + text.slice(open + 4);
    at = close + 3;
  }
}

/**
 * Words of prose in an MDX source. Ported from the libraries'
 * `doc-prose-budget.ts`: frontmatter, fences, imports, comments, link targets,
 * tags, headings, table rows and list markers go before the count.
 */
export function proseWords(source: string): number {
  const prose = withoutHtmlComments(
    source
      .replace(/^---\n.*?\n---\n/s, '')
      .replace(/^(\s*)(`{3,})[^\n]*\n.*?^\s*\2[^\n]*$/gms, '')
      .replace(/^(import|export)\s[^\n]*$/gm, '')
      .replace(/\{\/\*.*?\*\/\}/gs, ''),
  )
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s[^\n]*$/gm, '')
    .replace(/^\s*\|.*$/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '');

  return prose.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/**
 * G8: a page over 1,200 words of prose is reported and never fails the build
 * (standard section 4). A slug starting with `api` is exempt (reference-page
 * budget decision 3, adopted on this site's authority). An acceptance for a
 * page now within the budget, or for a page that is gone, fails.
 */
export function checkProseBudget(
  pages: DocsPage[],
  accepted: Record<string, string>,
): { over: string[]; stale: string[] } {
  const over: string[] = [];
  const stale: string[] = [];
  const counts = new Map(
    pages.map((page) => [page.slug, proseWords(page.source)]),
  );

  for (const [slug, words] of counts) {
    if (slug.startsWith('api') || words <= PROSE_BUDGET || slug in accepted)
      continue;
    over.push(
      `${slug}: ${words} words of prose against a budget of ${PROSE_BUDGET}. Cut it or split it, or record the reviewer’s acceptance in doc-prose-budget.json.`,
    );
  }

  for (const slug of Object.keys(accepted)) {
    const words = counts.get(slug);
    if (words === undefined)
      stale.push(
        `doc-prose-budget.json: '${slug}' has no page. Remove the entry.`,
      );
    else if (words <= PROSE_BUDGET)
      stale.push(
        `doc-prose-budget.json: '${slug}' is within the budget. Remove the entry.`,
      );
  }

  return { over: over.sort(), stale: stale.sort() };
}
