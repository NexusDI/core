import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { workspaceRoot } from '@nx/devkit';

import { readSite, type DocsPage } from './site';

type Expand = (source: string, root: string, file: string) => string;

/**
 * The doc-examples loaders are plain ESM. A computed specifier keeps the
 * TypeScript program from resolving them; each getter states the shape it reads.
 */
async function load<T>(specifier: string): Promise<T> {
  return (await import(/* @vite-ignore */ specifier)) as T;
}

export async function loadRegionExpander(): Promise<Expand> {
  return (
    await load<{ expandRegions: Expand }>(
      '@nexusdi/doc-examples/mdx-region-loader',
    )
  ).expandRegions;
}

/** The class prefixes the docs build gives the reference loader. */
export interface ReferenceOptions {
  classPrefix: string;
  kindPrefix: string;
}

type MdSiblings = (
  contentDir: string,
  root: string,
  options: ReferenceOptions,
) => Map<string, string>;

/** The docs app's `reference-options.mjs`, which the loader chain reads. */
export async function loadReferenceOptions(): Promise<ReferenceOptions> {
  const path = join(workspaceRoot, 'apps/docs/tools/reference-options.mjs');
  return (
    await load<{ referenceOptions: ReferenceOptions }>(pathToFileURL(path).href)
  ).referenceOptions;
}

export async function loadMdSiblings(): Promise<MdSiblings> {
  return (
    await load<{ mdSiblings: MdSiblings }>('@nexusdi/doc-examples/md-siblings')
  ).mdSiblings;
}

export async function loadRegions(): Promise<{
  readRegion: (
    source: string,
    file: string,
    name: string,
  ) => { lang: string; code: string };
}> {
  return load('@nexusdi/doc-examples/regions');
}

/** The content tree with every `file=… region=…` fence filled, as the build fills it. */
export async function readExpandedSite(
  contentDir: string,
): Promise<DocsPage[]> {
  const expandRegions = await loadRegionExpander();
  return readSite(contentDir, {
    transform: (source, file) => expandRegions(source, workspaceRoot, file),
  });
}
