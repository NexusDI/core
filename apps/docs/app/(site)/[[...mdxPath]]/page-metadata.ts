import type { Metadata } from 'next';

import type { Channel } from '../../channel';

const ORIGIN = 'https://nexus.js.org';

/**
 * A page's `<head>` metadata: the page's own frontmatter, an absolute
 * canonical URL that includes the base path, and on the `/next/` build a
 * `noindex, follow` robots rule (spec §15.8).
 */
export function pageMetadata(
  metadata: Record<string, unknown>,
  mdxPath: readonly string[] | undefined,
  channel: Channel,
  basePath: string,
): Metadata {
  const { console: _console, ...rest } = metadata;
  const path = (mdxPath ?? []).filter(Boolean).join('/');
  const canonical = `${ORIGIN}${basePath}/${path ? `${path}/` : ''}`;

  return {
    ...(rest as Metadata),
    alternates: { canonical },
    ...(channel === 'next' ? { robots: { index: false, follow: true } } : {}),
  };
}
