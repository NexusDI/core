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
  InvalidModuleError,
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

import { describeValue } from './describe.js';
import { testingPlugin } from './plugin.js';

export { OverrideError } from './override-error.js';

export interface TestingCreateOptions extends CreateOptions {
  /** Run onInit during create. Defaults to true. */
  readonly onInit?: boolean;
}

export interface ModuleOverrideOptions {
  /**
   * Marks the override as applying later, when a `ship.load()` call brings
   * in the module, instead of at `create()`. `create()` then does not
   * report the override as unused.
   */
  readonly lazy?: boolean;
}

export interface TestingContainerBuilder {
  /** Replaces every provider of `token` with a value or a class, typed like provide(). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the class constraint provide() uses
  override<T, C extends new (...args: any) => NoInfer<T>>(
    token: InjectionToken<T> | MultiToken<T>,
    definition: OverrideDefinition<T, C>,
  ): TestingContainerBuilder;
  /** Replaces every provider of `token` with a factory, typed like provide(). */
  override<
    T,
    const D extends readonly Dep[],
    R extends NoInfer<T> | PromiseLike<NoInfer<T>>,
  >(
    token: [T] extends [PromiseLike<unknown>]
      ? PromiseTokenMessage
      : InjectionToken<T> | MultiToken<T>,
    definition: FactoryDefinition<D, R>,
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
}

const register = provide as (
  token: unknown,
  definition: unknown,
) => ProviderEntry;

function definitionOf(ref: ModuleRef): ModuleDefinition {
  const definition = moduleDefinitionOf(ref);
  if (definition === undefined)
    throw new InvalidModuleError({ received: describeValue(ref), path: [] });
  return definition;
}

function builder(state: BuilderState): TestingContainerBuilder {
  return {
    override(token: unknown, definition: unknown): TestingContainerBuilder {
      return builder({
        ...state,
        providers: new Map([
          ...state.providers,
          [token, register(token, definition)],
        ]),
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
                onInit,
              }),
              ...plugins,
            ]
          : plugins,
      });
    },
  };
}

export function createTestingContainer(
  root: ModuleRef,
): TestingContainerBuilder {
  return builder({
    root,
    providers: new Map(),
    modules: new Map(),
    lazyModules: new Set(),
  });
}
