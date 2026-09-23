/**
 * The two builds of the site. `next` is `/next/`, built from `main` with no
 * blog. `release` is the root, built from the newest stable release tag.
 * Spec §15.3 gives the deploy that sets these.
 */
export type Channel = 'next' | 'release';

type Env = Record<string, string | undefined>;

export function readChannel(env: Env = process.env): Channel {
  const value = env['DOCS_CHANNEL'] ?? 'next';
  if (value === 'next' || value === 'release') return value;
  throw new Error(`DOCS_CHANNEL is '${value}'. Set it to 'next' or 'release'.`);
}

/**
 * The base path Next prefixes to every link and asset. Next adds it, so no
 * content link ever writes `/next/` itself (spec §15.4).
 */
export function readBasePath(env: Env = process.env): string {
  const value = env['DOCS_BASE_PATH'] ?? '';
  if (value === '' || (value.startsWith('/') && !value.endsWith('/'))) {
    return value;
  }
  throw new Error(
    `DOCS_BASE_PATH is '${value}'. It must be empty or start with '/' and not end with '/'.`,
  );
}
