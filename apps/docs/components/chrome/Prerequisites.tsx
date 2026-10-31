import Link from 'next/link';

import meta from '../../content/_meta';

/**
 * The prerequisites plate (site UX spec 13.2): the placard "Before this page"
 * and the one or two pages a teaching page `requires`. `mdx-nextra-loader.mjs`
 * writes it above the page's first H2 from the frontmatter, so no page names
 * it by hand. A slug that `_meta.ts` does not know falls back to the slug.
 */
export default function Prerequisites({
  requires,
}: {
  requires: readonly string[];
}) {
  if (requires.length === 0) return null;

  return (
    <aside className="nexus-prereq" aria-label="Before this page">
      <p className="nexus-prereq__placard">Before this page</p>
      <ul>
        {requires.map((slug) => {
          const entry = (meta as Record<string, { title?: string }>)[slug];
          return (
            <li key={slug}>
              <Link href={`/${slug}/`}>{entry?.title ?? slug}</Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
