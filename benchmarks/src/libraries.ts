/**
 * libraries.json: the libraries, their pinned versions, their variants and
 * profiles, and the claims their fixtures rest on (spec 4.3).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Configs } from '@nexusdi/toolchain-matrix/recipes';

import type { LibraryId, Profile, Variant } from './schema.ts';

export interface Claim {
  claim: string;
  /** The page that states it. */
  source: string;
  /** The version the claim was checked against; libraries-claims holds it to the pin. */
  verifiedAgainst: string;
  /** The scale renderer form the claim backs (scale spec 4.2), if any. */
  form?: 'module' | 'async-factory';
}

/**
 * How a scale renderer expresses a graph module (scale spec 4.3):
 * NexusDI modules, InversifyJS ContainerModules, one tsyringe @registry
 * class, or a plain register<Module>(container) function where the
 * library has no module unit.
 */
export type ModuleForm =
  'modules' | 'container-modules' | 'registry' | 'registration-functions';

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
  moduleForm: ModuleForm;
  /** Why the module form departs from the docs; set for registration functions. */
  moduleNote?: string;
  /** Lifetime or async factory, to the reason the library has none. */
  notApplicable: Partial<
    Record<'transient' | 'scoped' | 'async-factory', string>
  >;
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
