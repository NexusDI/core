import { ratchetFindings } from './allowance';
import { isPreFinalPost, type DocsPage } from './site';

const TOKEN = /^[A-Z][A-Z0-9_]*$/;
const MODIFIER = /^(?:lazy|optional|all)\(\s*[A-Z][A-Z0-9_]*\s*\)$/;
const CONTRACT = /^[A-Za-z_$][\w$]*\.(?:token|multi)<[^>]*>\([^)]*\)$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const STRING = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
const SKIPPED_TAGS = ['anti-example', 'fails-type-check'];

const isToken = (text: string): boolean =>
  TOKEN.test(text) || MODIFIER.test(text) || CONTRACT.test(text);

/** Each place `code` binds a class where an interface token belongs. */
export function interfaceFirstHits(code: string): string[] {
  const text = code.replace(STRING, '""');
  const hits: string[] = [];

  for (const [, first = ''] of text.matchAll(/\bprovide\(\s*([^,\s)]+)/g))
    if (!isToken(first)) hits.push(`provide(${first}`);
  for (const [, token = ''] of text.matchAll(/\btoken:\s*([^,\s}]+)/g))
    if (token !== '""' && !isToken(token)) hits.push(`token: ${token}`);
  for (const [, list = ''] of text.matchAll(/\bdeps\s*[:=]\s*\[([^\]]*)\]/g))
    for (const entry of list.split(',').map((part) => part.trim()))
      if (entry !== '' && !isToken(entry)) hits.push(`deps entry ${entry}`);
  for (const [, name = ''] of text.matchAll(/\buseClass:\s*([^,\s}]+)/g))
    if (!IDENTIFIER.test(name)) hits.push(`useClass: ${name}`);

  return hits;
}

/** Each hit in the page's fences, as a ratchet count per fence. */
function pageHits(page: DocsPage): { line: number; hits: string[] }[] {
  return page.fences
    .filter((fence) => !fence.tags.some((tag) => SKIPPED_TAGS.includes(tag)))
    .map((fence) => ({
      line: fence.line,
      hits: interfaceFirstHits(fence.body),
    }))
    .filter((found) => found.hits.length > 0);
}

/**
 * The interface-first rule of spec section 7.3, where a pattern reaches it.
 * `/getting-started/` binds classes as their own tokens (spec decision 31), a
 * `domainExempt` Migration page shows 0.3 code, and a post below 0.4.0 keeps
 * its text; all three are skipped. The allowance counts the fences a page has
 * left to rewrite, and it only goes down.
 */
export function checkInterfaceFirst(
  pages: DocsPage[],
  allowance: Record<string, number> = {},
): string[] {
  const found = new Map<string, { line: number; hits: string[] }[]>();
  for (const page of pages) {
    if (page.slug === 'getting-started') continue;
    if (page.frontmatter.domainExempt === true || isPreFinalPost(page))
      continue;
    found.set(page.slug, pageHits(page));
  }

  const counts = Object.fromEntries(
    [...found].map(([slug, fences]) => [slug, fences.length]),
  );
  const files = new Map(pages.map((page) => [page.slug, page.file]));

  return ratchetFindings(
    'doc-interface-first-allowance.json',
    counts,
    allowance,
    (slug, count, limit) => {
      const fences = found.get(slug) ?? [];
      const where = fences
        .map(
          ({ line, hits }) =>
            `${files.get(slug)}:${line}: binds a class where an interface token belongs (${hits.join(', ')})`,
        )
        .join('; ');
      return `${where}. Fences with a hit: ${count}, allowance ${limit}. Give the service an interface and a Token<IFoo>, bind the class with useClass, and list tokens in deps (spec section 7.3).`;
    },
  ).sort();
}
