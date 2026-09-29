import { readFileSync } from 'node:fs';

/** This package's version, read from its package.json next to dist/ and src/. */
export function cliVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  return manifest.version;
}
