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
        name: context.name ?? target.name,
      }),
    );
  };
}
