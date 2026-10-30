/// <reference lib="esnext.disposable" preserve="true" />
/**
 * `@nexusdi/testing`: a container with replacements.
 *
 * A unit test of one class needs none of this; it calls the constructor with
 * fakes. This package is for tests that want the real module graph with a few
 * providers or modules swapped. The builder is immutable, so a beforeEach can
 * share a base builder. The container it builds is a plain Nexus with one
 * plugin, nexus:testing, ahead of the caller's plugins.
 */
import {
  CoreNotSharedError,
  describeValue,
  InvalidModuleError,
  isForeign,
  moduleDefinitionOf,
  Nexus,
  provide,
  type CreateOptions,
  type Dep,
  type FactoryDefinition,
  type InjectionToken,
  type ModuleDefinition,
  type ModuleRef,
  type MultiToken,
  type OverrideDefinition,
  type PromiseTokenMessage,
  type ProviderEntry,
} from '@nexusdi/core';

import { testingPlugin } from './plugin.js';

export { OverrideError } from './override-error.js';

/**
 * The options `create()` takes: every option of `Nexus.create`, plus `onInit`.
 * The testing plugin goes ahead of the plugins listed here.
 */
export interface TestingCreateOptions extends CreateOptions {
  /** Run onInit during create. Defaults to true. */
  readonly onInit?: boolean;
}

/** The options `overrideModule()` takes. */
export interface ModuleOverrideOptions {
  /**
   * Marks the override as applying later, when a `ship.load()` call brings
   * in the module, instead of at `create()`. `create()` then does not
   * report the override as unused.
   */
  readonly lazy?: boolean;
}

/** The options `override()` takes. */
export interface OverrideOptions {
  /**
   * Lets the override stay unused at `create()`. The first `ship.load()`
   * that adds a provider of the token applies it. A later non-lazy
   * `override()` of the same token makes it strict again.
   */
  readonly lazy?: boolean;
}

/**
 * Collects replacements for a module graph and builds a container with them.
 * Each method returns a new builder and leaves the one it was called on as it
 * was, so a `beforeEach` can share a base builder.
 */
export interface TestingContainerBuilder {
  /**
   * Replaces every provider of `token` with a value or a class, typed like
   * provide(). `{ lazy: true }` lets a later load() be the first use.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the class constraint provide() uses
  override<T, C extends new (...args: any) => NoInfer<T>>(
    token: InjectionToken<T> | MultiToken<T>,
    definition: OverrideDefinition<T, C>,
    options?: OverrideOptions,
  ): TestingContainerBuilder;
  /**
   * Replaces every provider of `token` with a factory, typed like provide().
   * `{ lazy: true }` lets a later load() be the first use.
   */
  override<
    T,
    const D extends readonly Dep[],
    R extends NoInfer<T> | PromiseLike<NoInfer<T>>,
  >(
    token: [T] extends [PromiseLike<unknown>]
      ? PromiseTokenMessage
      : InjectionToken<T> | MultiToken<T>,
    definition: FactoryDefinition<D, R>,
    options?: OverrideOptions,
  ): TestingContainerBuilder;
  /**
   * Walks `stub` wherever the walk meets `module`, including every forRoot()
   * or forRootAsync() instance of it. `{ lazy: true }` lets a later load()
   * be the first use.
   */
  overrideModule(
    module: ModuleRef,
    stub: ModuleRef,
    options?: ModuleOverrideOptions,
  ): TestingContainerBuilder;
  /** Runs the full compiler with the overrides and builds the container. */
  create(options?: TestingCreateOptions): Promise<Nexus>;
}

interface BuilderState {
  readonly root: ModuleRef;
  readonly providers: ReadonlyMap<unknown, ProviderEntry>;
  readonly modules: ReadonlyMap<ModuleDefinition, ModuleDefinition>;
  readonly lazyModules: ReadonlySet<ModuleDefinition>;
  readonly lazyTokens: ReadonlySet<unknown>;
}

const register = provide as (
  token: unknown,
  definition: unknown,
) => ProviderEntry;

function definitionOf(ref: ModuleRef): ModuleDefinition {
  const definition = moduleDefinitionOf(ref);
  if (definition === undefined)
    throw isForeign(ref)
      ? new CoreNotSharedError({
          received: describeValue(ref),
          where: 'overrideModule()',
        })
      : new InvalidModuleError({ received: describeValue(ref), path: [] });
  return definition;
}

function builder(state: BuilderState): TestingContainerBuilder {
  return {
    override(
      token: unknown,
      definition: unknown,
      options: OverrideOptions = {},
    ): TestingContainerBuilder {
      const lazyTokens = new Set(state.lazyTokens);
      if (options.lazy === true) lazyTokens.add(token);
      else lazyTokens.delete(token);
      return builder({
        ...state,
        providers: new Map([
          ...state.providers,
          [token, register(token, definition)],
        ]),
        lazyTokens,
      });
    },
    overrideModule(
      module: ModuleRef,
      stub: ModuleRef,
      options: ModuleOverrideOptions = {},
    ): TestingContainerBuilder {
      const original = definitionOf(module);
      const lazyModules = new Set(state.lazyModules);
      if (options.lazy === true) lazyModules.add(original);
      else lazyModules.delete(original);
      return builder({
        ...state,
        modules: new Map([...state.modules, [original, definitionOf(stub)]]),
        lazyModules,
      });
    },
    create(options: TestingCreateOptions = {}): Promise<Nexus> {
      const { onInit = true, plugins = [], ...rest } = options;
      // A plugins value that is not an array goes to core as given, so
      // Nexus.create reports it as it would without the testing container.
      return Nexus.create(state.root, {
        ...rest,
        plugins: Array.isArray(plugins)
          ? [
              testingPlugin({
                providers: state.providers,
                modules: state.modules,
                lazyModules: state.lazyModules,
                lazyTokens: state.lazyTokens,
                onInit,
              }),
              ...plugins,
            ]
          : plugins,
      });
    },
  };
}

/**
 * Starts a builder for a container of `root`'s module graph, with no
 * replacements yet.
 *
 * `override(token, definition)` replaces every provider of a token,
 * `overrideModule(module, stub)` replaces a module wherever the graph meets
 * it, and `create(options)` builds a plain `Nexus` with the replacements
 * applied by the `nexus:testing` plugin, ahead of the caller's plugins.
 */
export function createTestingContainer(
  root: ModuleRef,
): TestingContainerBuilder {
  return builder({
    root,
    providers: new Map(),
    modules: new Map(),
    lazyModules: new Set(),
    lazyTokens: new Set(),
  });
}
