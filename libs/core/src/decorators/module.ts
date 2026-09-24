import {
  defineModule,
  registerModuleClass,
  type ModuleConfig,
} from '../definitions/define-module.js';
import type { ProviderEntries } from '../definitions/provider-literal.js';
import type { Class } from '../definitions/types.js';
import { assertStandard } from './legacy.js';

/**
 * A decorator cannot add a typed static with() to a class, so @Module classes
 * are not configurable. Configurable modules use defineModule.
 */
export type ModuleDecoratorConfig = Omit<ModuleConfig, 'name'> & {
  readonly options?: never;
  readonly schema?: never;
};

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
    registerModuleClass(
      target,
      defineModule({
        ...(config as ModuleDecoratorConfig),
        // An empty name falls through too. When nothing reads a class's
        // binding, Rollup drops it from tsc's emit, and then the class and its
        // context both carry ''.
        name: context.name || target.name || '(anonymous module)',
      }),
    );
  };
}
