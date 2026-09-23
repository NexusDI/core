import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * The files under one folder of the snapshot overlay, as sorted paths
 * relative to that folder with forward slashes. A missing folder holds none.
 */
export function overlayFiles(snapshotDir, sub) {
  const dir = join(snapshotDir, sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'),
    )
    .sort();
}

/**
 * The 0.3 documentation pages at `ref`, relative to `docs/docs/`, which is
 * where `cp -R apps/docs/snapshot/. snapshot-src/docs/` puts a file from the
 * overlay's own `docs/` folder.
 */
export function sourcePages(ref, cwd) {
  return execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', ref, 'docs/docs/'],
    {
      cwd,
      encoding: 'utf8',
    },
  )
    .split('\n')
    .filter(Boolean)
    .map((path) => path.slice('docs/docs/'.length));
}

/** Overlay pages that replace nothing, and so would add a page to the 0.3 site. */
export function strayPages(overlay, source) {
  const pages = new Set(source);
  return overlay.filter((path) => !pages.has(path));
}
