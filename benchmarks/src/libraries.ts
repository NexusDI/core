/**
 * libraries.json: the libraries, their pinned versions, their variants and
 * profiles, and the claims their fixtures rest on (spec 4.3).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { LibraryId, Profile, Variant } from './schema.ts';

export interface Claim {
  claim: string;
  /** The page that states it. */
  source: string;
  /** The version the claim was checked against; libraries-claims holds it to the pin. */
  verifiedAgainst: string;
}

export interface Library {
  id: LibraryId;
  package: string;
  /** Exact pin, or 'workspace' for the packed @nexusdi/core. */
  version: string;
  docs: string;
  /** The date the docs were read, YYYY-MM-DD. */
  read: string;
  polyfill: string | null;
  /** The toolchains the library's docs name, or 'any'. */
  documentedToolchains: 'any' | string[];
  variants: Partial<
    Record<Variant, { profile: Profile; documented?: boolean }>
  >;
  /** Lifetime to the reason the library has none. */
  notApplicable: Partial<Record<'transient' | 'scoped', string>>;
  claims: Claim[];
}

export interface LibrariesFile {
  libraries: Library[];
}

export const BENCHMARKS = join(import.meta.dirname, '..');
export const FIXTURES = join(BENCHMARKS, 'fixtures');

export function readLibraries(): LibrariesFile {
  return JSON.parse(
    readFileSync(join(BENCHMARKS, 'libraries.json'), 'utf8'),
  ) as LibrariesFile;
}

/** Config file paths as the recipes take them, relative to a cell's directory. */
export interface Configs {
  rootDir: string;
  tsconfig: string;
  swcrc: string;
  babelrc: string;
  viteConfig: string;
  denoConfig?: string;
}

/**
 * The configs of `profile` for `toolchain`. A cell copies `fixtures/config`
 * into its directory, and the profile's tsconfig.json to its root, where
 * Vite's Oxc and Bun look for the decorator flags.
 */
export function configsFor(profile: Profile, toolchain: string): Configs {
  const at = `config/${profile}`;
  return {
    rootDir: 'src',
    tsconfig: 'tsconfig.json',
    swcrc: `${at}/.swcrc`,
    babelrc: `${at}/babel.config.json`,
    viteConfig:
      toolchain === 'vite8+babel-plugin'
        ? `${at}/vite.babel.config.mjs`
        : `${at}/vite.config.mjs`,
    denoConfig: `${at}/deno.json`,
  };
}
