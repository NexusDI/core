/**
 * Where the refused phrase "native decorator(s)" may still appear.
 *
 * NexusDI 0.3 uses TypeScript's legacy decorators behind
 * `experimentalDecorators`. No JavaScript engine ships decorators, and 0.3
 * supports no TC39 standard decorator either, so a page that calls its
 * decorators "native" makes a claim the package does not back.
 *
 * A dated blog post is a record of what shipped at the time, kept verbatim,
 * so a post from before the correction date is exempt.
 */

const REFUSED = /native decorators?/i;

/** The 1-based lines of `source` that carry the refused phrase. */
export function claimLines(source: string): number[] {
  return source
    .split('\n')
    .map((line, index) => (REFUSED.test(line) ? index + 1 : -1))
    .filter((line) => line !== -1);
}

/** Whether `file`'s basename is a dated post from before `cutoff` (an ISO date). */
export function isHistoricalPost(file: string, cutoff: string): boolean {
  const match = /(\d{4}-\d{2}-\d{2})-[^/]+$/.exec(file);
  return match !== null && (match[1] as string) < cutoff;
}

export interface Claim {
  file: string;
  line: number;
}

/** Every claim in `pages`, skipping a historical post dated before `cutoff`. */
export function claimsIn(
  pages: readonly { file: string; source: string }[],
  cutoff: string,
): Claim[] {
  const claims: Claim[] = [];

  for (const page of pages) {
    if (isHistoricalPost(page.file, cutoff)) continue;
    for (const line of claimLines(page.source))
      claims.push({ file: page.file, line });
  }

  return claims.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
