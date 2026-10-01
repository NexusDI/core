import { ratchet } from './allowance';
import { isPreFinalPost, type DocsPage } from './site';

/**
 * The 0.3 site's domain and the 0.3 API names 0.4 removes (spec section 7.4),
 * counted at 6d5e4f3. An example on this site is set on the Starship Meridian.
 */
const DENY: readonly RegExp[] = [
  /\b(?:UserService|UserModule|UserRepository|DatabaseService|DatabaseModule|EmailService|LoggerService|LoggingModule|OrderService|AppModule)\b/g,
  /\bI[A-Z]\w*Service\b/g,
  /@(?:Service|Provider)\b/g,
  /\b(?:DynamicModule|createChildContainer|TokenType|ContainerException|NoProvider|configAsync)\b/g,
  /\bnew Nexus\(\)/g,
];

/** Every deny-list hit in the page's fences, as written. */
export function domainHits(page: DocsPage): string[] {
  return page.fences.flatMap((fence) =>
    DENY.flatMap((pattern) =>
      [...fence.body.matchAll(pattern)].map((match) => match[0]),
    ),
  );
}

/**
 * G9: no fence names the abandoned domain or a removed 0.3 API. A page marked
 * `domainExempt` (the Migration band) and a post below 0.4.0 name 0.3 code on
 * purpose and are skipped. The ratchet file only goes down.
 */
export function checkDomain(
  pages: DocsPage[],
  allowance: Record<string, number>,
): string[] {
  const hits = new Map<string, string[]>();
  for (const page of pages) {
    if (page.frontmatter.domainExempt === true || isPreFinalPost(page))
      continue;
    hits.set(page.slug, domainHits(page));
  }

  const counts = Object.fromEntries(
    [...hits].map(([slug, found]) => [slug, found.length]),
  );
  const { over, slack, stale } = ratchet(counts, allowance);
  const findings: string[] = [];

  for (const line of over) {
    const slug = line.split(': ')[0] as string;
    const found = [...new Set(hits.get(slug))].sort();
    findings.push(
      `${slug}: ${counts[slug]} names from the 0.3 site in fences (${found.join(', ')}), allowance ${allowance[slug] ?? 0}. Set the example on the Starship Meridian (spec section 7), or mark a Migration page domainExempt.`,
    );
  }
  for (const line of slack) {
    findings.push(
      `doc-domain-allowance.json: ${line}. Lower the entry to the count, and remove it at zero.`,
    );
  }
  for (const slug of stale) {
    findings.push(
      `doc-domain-allowance.json: ${slug} has no page. Remove the entry.`,
    );
  }

  return findings.sort();
}
