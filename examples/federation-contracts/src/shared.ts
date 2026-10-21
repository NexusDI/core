import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** One entry of a `ModuleFederationPlugin`'s `shared` object. */
export interface SharedSingleton {
  readonly singleton: true;
  readonly requiredVersion: string;
}

const versionOf = (name: string): string =>
  (require(`${name}/package.json`) as { version: string }).version;

/**
 * The `shared` object every Meridian bundle passes to its
 * `ModuleFederationPlugin`, so the shell and each remote hold one copy of
 * React and one copy of core. `@nexusdi/react` is shared too, because a
 * remote's `useService` reads the shell's `NexusProvider` only through the
 * same copy. Its version is core's, since every `@nexusdi/*` package
 * releases at core's version.
 *
 * The contracts package, `@nexusdi/federation` and `@nexusdi/decorators`
 * have no entry, so each bundle holds its own copy and `federation()` binds
 * the contract tokens by key.
 *
 * `core: false` drops the `@nexusdi/core` entry. The unshared build of
 * federation-cartography passes it to show `NEXUS_CORE_NOT_SHARED`.
 */
export function meridianShared(
  options: { readonly core?: boolean } = {},
): Record<string, SharedSingleton> {
  const react = versionOf('react');
  const core = versionOf('@nexusdi/core');
  return {
    react: { singleton: true, requiredVersion: react },
    'react-dom': { singleton: true, requiredVersion: react },
    ...(options.core === false
      ? {}
      : { '@nexusdi/core': { singleton: true, requiredVersion: core } }),
    '@nexusdi/react': { singleton: true, requiredVersion: core },
  };
}
