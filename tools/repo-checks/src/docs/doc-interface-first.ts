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

/**
 * The interface-first rule of spec section 7.3, where a pattern reaches it.
 * `/getting-started/` binds classes as their own tokens (spec decision 31), a
 * `domainExempt` Migration page shows 0.3 code, and a post below 0.4.0 keeps
 * its text; all three are skipped.
 */
export function checkInterfaceFirst(pages: DocsPage[]): string[] {
  const findings: string[] = [];

  for (const page of pages) {
    if (page.slug === 'getting-started') continue;
    if (page.frontmatter.domainExempt === true || isPreFinalPost(page))
      continue;

    for (const fence of page.fences) {
      if (fence.tags.some((tag) => SKIPPED_TAGS.includes(tag))) continue;
      const hits = interfaceFirstHits(fence.body);
      if (hits.length === 0) continue;
      findings.push(
        `${page.file}:${fence.line}: binds a class where an interface token belongs (${hits.join(', ')}). Give the service an interface and a Token<IFoo>, bind the class with useClass, and list tokens in deps (spec section 7.3).`,
      );
    }
  }

  return findings.sort();
}
