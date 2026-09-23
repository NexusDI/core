import type { Channel } from '../../channel';

/**
 * Whether a content route is exported on this channel. The `/next/` build
 * leaves `content/blog/` out, because during the RC the blog lives on the 0.3
 * site at the root (spec §6.1).
 */
export function keepRoute(
  mdxPath: readonly string[] | undefined,
  channel: Channel,
): boolean {
  if (channel === 'release') return true;
  return mdxPath?.[0] !== 'blog';
}
