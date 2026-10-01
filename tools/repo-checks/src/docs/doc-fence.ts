import { ratchet } from './allowance';
import {
  EXEMPTION_TAGS,
  SHELL_LANGS,
  type DocsFence,
  type DocsPage,
} from './site';

/** The two tags a writer can use in place of wiring a doctest. */
const ABUSABLE = ['anti-example', 'no-run'];

interface Tally {
  unexplained: number;
  regions: number;
  abusable: number;
}

/** What the documentation standard section 5 says a fence is. */
function fenceClass(
  fence: DocsFence,
): 'region' | 'twoslash' | 'shell' | 'diagram' | 'tagged' | 'unexplained' {
  const words = fence.meta.split(/\s+/);
  if (
    /(?:^|\s)file=\S+/.test(fence.meta) &&
    /(?:^|\s)region=[\w-]+/.test(fence.meta)
  ) {
    return 'region';
  }
  if (words.includes('twoslash')) return 'twoslash';
  if ((SHELL_LANGS as readonly string[]).includes(fence.lang)) return 'shell';
  if (fence.lang === 'mermaid') return 'diagram';
  if (
    words.some((word) => (EXEMPTION_TAGS as readonly string[]).includes(word))
  )
    return 'tagged';
  return 'unexplained';
}

/** Per page: fences nothing ran, executed regions, and the two abusable tags. */
export function tallyFences(pages: DocsPage[]): Map<string, Tally> {
  const tally = new Map<string, Tally>();

  for (const page of pages) {
    if (page.kind === 'post') continue;
    const held: Tally = { unexplained: 0, regions: 0, abusable: 0 };

    for (const fence of page.fences) {
      const kind = fenceClass(fence);
      if (kind === 'region') held.regions += 1;
      if (kind === 'unexplained') held.unexplained += 1;
      if (fence.tags.some((tag) => ABUSABLE.includes(tag))) held.abusable += 1;
    }

    tally.set(page.slug, held);
  }

  return tally;
}

/**
 * G3: every fence is executed, compiled, a shell block, a diagram, or tagged,
 * and no page explains itself mostly by exemption. `post` pages are skipped,
 * because amendment A2 tags a dated post's code `elided`.
 */
export function checkFence(
  pages: DocsPage[],
  allowance: Record<string, number>,
): string[] {
  const tally = tallyFences(pages);
  const counts = Object.fromEntries(
    [...tally].map(([slug, held]) => [slug, held.unexplained]),
  );
  const { over, slack, stale } = ratchet(counts, allowance);
  const findings: string[] = [];

  for (const line of over) {
    const [slug, rest] = line.split(': ');
    const count = Number(rest?.split(',')[0]);
    findings.push(
      `${slug}: ${count} unexplained fence${count === 1 ? '' : 's'}, ${rest?.split(', ')[1]}. Cite a doctested region with file= region=, use a twoslash fence, or tag the block with signature, no-run, anti-example, fails-type-check or elided. The allowance in doc-fence-allowance.json only goes down.`,
    );
  }

  for (const [slug, held] of tally) {
    if (held.abusable > held.regions) {
      findings.push(
        `${slug}: ${held.abusable} fences tagged anti-example or no-run against ${held.regions} executed region${held.regions === 1 ? '' : 's'}. Documentation standard section 5 caps the two tags at the executed count. Cite a region.`,
      );
    }
  }

  for (const line of slack) {
    findings.push(
      `doc-fence-allowance.json: ${line}. Lower the entry to the count, and remove it at zero.`,
    );
  }
  for (const slug of stale) {
    findings.push(
      `doc-fence-allowance.json: ${slug} has no page. Remove the entry.`,
    );
  }

  return findings.sort();
}
