import meta from '../content/_meta';

/**
 * The sidebar band a page sits under, for the search filter (site UX spec
 * 13.5). The bands are the separators of `content/_meta.ts`, and a page belongs
 * to the last separator above its entry. The navbar entries (`docs`, `blog`)
 * are `page` items and belong to no band.
 */
export function bandOf(
  slug: string | undefined,
  record: Record<string, unknown> = meta,
): string | undefined {
  if (!slug) return undefined;
  let band: string | undefined;
  for (const [key, value] of Object.entries(record)) {
    const entry = value as { type?: string; title?: string };
    if (entry.type === 'separator') {
      band = entry.title;
      continue;
    }
    if (key === slug) return entry.type === 'page' ? undefined : band;
  }
  return undefined;
}
