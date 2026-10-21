import {
  InvalidModuleError,
  declareModuleClass,
  describeValue,
  type ModuleConfig,
  type ProviderEntries,
} from '@nexusdi/core';

import { assertStandard } from './legacy.js';

/**
 * The config `@Module` takes: a `ModuleConfig` whose `name` is optional.
 * Without a `name`, the module takes the class name, and a production
 * minifier renames classes. Set `name` to keep the module's name in errors
 * and in the graph after a minifier renames the class. A `name` that is not
 * a non-empty string throws NEXUS_INVALID_MODULE when the decorator runs.
 *
 * A decorator cannot add typed static forRoot() and forRootAsync() methods
 * to a class, so @Module classes are not configurable. Configurable modules
 * use defineModule.
 */
export type ModuleDecoratorConfig = Omit<ModuleConfig, 'name'> & {
  readonly name?: string;
  readonly options?: never;
  readonly schema?: never;
};

type Class = abstract new (...args: never) => unknown;

/**
 * Sugar for defineModule. The module takes `config.name`, or else the class
 * name. `providers` gets the per-element check defineModule applies.
 */
export function Module<const P extends readonly unknown[] = []>(
  config: Omit<ModuleDecoratorConfig, 'providers'> & {
    readonly providers?: ProviderEntries<P>;
  },
): (target: Class, context: ClassDecoratorContext) => void {
  return (target, context) => {
    assertStandard(context, 'Module');
    // Own properties only, as defineModule reads its config (SEC-003).
    // `name` is read only when it is an own property, and then once, so a
    // getter on it cannot pass the check and then return another value. An
    // own `undefined` counts as no name, since the optional type allows it.
    const source: ModuleDecoratorConfig =
      typeof config === 'object' && config !== null
        ? (config as ModuleDecoratorConfig)
        : {};
    let own: unknown;
    let rest: Omit<ModuleDecoratorConfig, 'name'>;
    if (Object.hasOwn(source, 'name')) ({ name: own, ...rest } = source);
    else rest = { ...source };
    if (own !== undefined && (typeof own !== 'string' || own === '')) {
      const received = describeValue(own);
      throw new InvalidModuleError(
        { received, path: [] },
        {
          text:
            `@Module was given ${received} as its name.\n` +
            '  Fix: pass a non-empty string, or leave name out to name the module after the class.',
        },
      );
    }
    declareModuleClass(target, {
      ...rest,
      // Without a configured name, an empty class name falls through too.
      // When nothing reads a class's binding, Rollup drops it from tsc's
      // emit, and then the class and its context both carry ''.
      name:
        (own as string | undefined) ??
        (context.name || target.name || '(anonymous module)'),
    });
  };
}
