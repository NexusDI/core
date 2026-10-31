/**
 * What the docs search shows of a Pagefind response (site UX spec 13.5). The
 * model is plain data so the component renders it and a test reads it.
 */

/** The part of Pagefind's result data this search reads. */
export interface PagefindData {
  url: string;
  meta: { title?: string };
  filters?: Record<string, string[]>;
  sub_results: { title: string; url: string; excerpt: string }[];
}

export interface PagefindResponse {
  results: { data(): Promise<PagefindData> }[];
  filters?: Record<string, Record<string, number>>;
}

export interface Hit {
  title: string;
  url: string;
  excerpt: string;
}

export interface Group {
  url: string;
  title: string;
  /** The page's sidebar band, from its `data-pagefind-filter`. */
  band: string | undefined;
  hits: Hit[];
}

/** Pagefind indexes `scopes/index.html`; the page's address has no `.html`. */
export function cleanUrl(url: string): string {
  return url.replace(/\.html$/, '').replace(/\.html#/, '#');
}

export function group(data: PagefindData): Group {
  return {
    url: cleanUrl(data.url),
    title: data.meta.title ?? data.url,
    band: data.filters?.band?.[0],
    hits: data.sub_results.map((sub) => ({
      title: sub.title,
      url: cleanUrl(sub.url),
      excerpt: sub.excerpt,
    })),
  };
}

/** A filter row shows above this many matching pages. */
const FILTER_ABOVE = 10;

export interface BandCount {
  band: string;
  count: number;
}

/**
 * The bands the response found, in the sidebar's order and with their page
 * counts, or none when ten pages or fewer match.
 */
export function bandRow(
  response: Pick<PagefindResponse, 'results' | 'filters'>,
  order: readonly string[],
): BandCount[] {
  if (response.results.length <= FILTER_ABOVE) return [];
  const found = response.filters?.band ?? {};
  return order
    .filter((band) => (found[band] ?? 0) > 0)
    .map((band) => ({ band, count: found[band] ?? 0 }));
}

/** Every hit of every group, in the order the list shows them. */
export function flatten(groups: readonly Group[]): Hit[] {
  return groups.flatMap((each) => each.hits);
}
