import {
  declareModuleClass,
  type ModuleConfig,
  type ProviderEntries,
} from '@nexusdi/core';

import { assertStandard } from './legacy.js';

/**
 * A decorator cannot add typed static forRoot() and forRootAsync() methods
 * to a class, so @Module classes are not configurable. Configurable modules
 * use defineModule.
 */
export type ModuleDecoratorConfig = Omit<ModuleConfig, 'name'> & {
  readonly options?: never;
  readonly schema?: never;
};

type Class = abstract new (...args: never) => unknown;

/**
 * Sugar for defineModule, named after the class. `providers` gets the
 * per-element check defineModule applies (spec §4.6).
 */
export function Module<const P extends readonly unknown[] = []>(
  config: Omit<ModuleDecoratorConfig, 'providers'> & {
    readonly providers?: ProviderEntries<P>;
  },
): (target: Class, context: ClassDecoratorContext) => void {
  return (target, context) => {
    assertStandard(context, 'Module');
    declareModuleClass(target, {
      ...(config as ModuleDecoratorConfig),
      // An empty name falls through too. When nothing reads a class's
      // binding, Rollup drops it from tsc's emit, and then the class and its
      // context both carry ''.
      name: context.name || target.name || '(anonymous module)',
    });
  };
}
