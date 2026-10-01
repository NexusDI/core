/** One post as the blog index lists it. */
export interface PostEntry {
  route: string;
  title: string;
  date: string;
  description: string;
}

/** The fields of a page-map item this module reads. */
interface PageItem {
  route?: unknown;
  children?: unknown;
  frontMatter?: Record<string, unknown>;
}

const isoDate = (value: unknown): string =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value ?? '');

/**
 * The posts of a `/blog` page map, newest first: the pages whose frontmatter
 * says `kind: post` (spec §6.2). The index (`kind: blog`) and folders are
 * left out.
 */
export function postsOf(items: readonly unknown[]): PostEntry[] {
  return items
    .map((item) => item as PageItem)
    .filter(
      (item) =>
        typeof item.route === 'string' &&
        item.children === undefined &&
        item.frontMatter?.['kind'] === 'post',
    )
    .map((item) => ({
      route: item.route as string,
      title: String(item.frontMatter?.['title'] ?? item.route),
      date: isoDate(item.frontMatter?.['date']),
      description: String(item.frontMatter?.['description'] ?? ''),
    }))
    .sort(
      (a, b) => b.date.localeCompare(a.date) || a.route.localeCompare(b.route),
    );
}
