import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';

import { docExampleSources } from '@nexusdi/doc-examples';

import type { DocsPage } from './site';

const REFERENCE = /(?:^|\s)file=(\S+)\s+region=([\w-]+)/;

/** A package wires its doc examples when its Vite config calls both helpers. */
export function wiresDocExamples(source: string): boolean {
  const config = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  return /\bdocExamples\(/.test(config) && /\bdocExampleSources\(/.test(config);
}

/**
 * Where a region may come from, built from the tree under `root`: the Meridian
 * example, and the README and `docs/` globs of each package whose Vite config
 * wires doc examples. The globs are the non-source ones `docExampleSources()`
 * gives, so a file counts as a region root when its package runs it as a doc
 * example. A root ending in a slash is a folder.
 */
export function regionRoots(root: string): string[] {
  const libs = join(root, 'libs');
  const globs = docExampleSources().filter((glob) => !glob.startsWith('src/'));
  const packages = existsSync(libs)
    ? readdirSync(libs, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => {
          const config = join(libs, name, 'vite.config.ts');
          return (
            existsSync(config) && wiresDocExamples(readFileSync(config, 'utf8'))
          );
        })
        .sort()
    : [];
  return [
    'examples/meridian/',
    ...packages.flatMap((name) => globs.map((glob) => `libs/${name}/${glob}`)),
  ];
}

function inRoots(path: string, roots: readonly string[]): boolean {
  return roots.some((entry) =>
    entry.endsWith('/') ? path.startsWith(entry) : matchesGlob(path, entry),
  );
}

/**
 * Every `file=… region=…` fence names a file under a region root, the file
 * exists, and the region is in it. Seed regions are held by `doc-seeds` and
 * mission regions by `academy-missions` (phases 2 and 4).
 */
export function checkRegions(input: {
  pages: DocsPage[];
  root: string;
  roots: readonly string[];
  readRegion: (source: string, file: string, name: string) => unknown;
}): string[] {
  const { pages, root, roots, readRegion } = input;
  const findings: string[] = [];

  for (const page of pages) {
    for (const fence of page.fences) {
      const match = REFERENCE.exec(fence.meta);
      if (!match) continue;
      const [, path = '', name = ''] = match;
      const at = `${page.file}:${fence.line}`;

      if (!inRoots(path, roots)) {
        findings.push(
          `${at}: '${path}' is outside the region roots (${roots.join(', ')}). Cite a tested file.`,
        );
        continue;
      }

      let source: string;
      try {
        source = readFileSync(join(root, path), 'utf8');
      } catch {
        findings.push(
          `${at}: cannot read '${path}', which region '${name}' cites.`,
        );
        continue;
      }

      try {
        readRegion(source, path, name);
      } catch (error) {
        findings.push(`${at}: ${(error as Error).message}`);
      }
    }
  }

  return findings.sort();
}
