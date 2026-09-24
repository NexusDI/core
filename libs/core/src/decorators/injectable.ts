import '../polyfill/symbol-metadata.js';

import { writeInjectable } from '../definitions/metadata.js';
import type { DepsFor } from '../definitions/provide.js';
import type { Ctor, Lifetime } from '../definitions/types.js';
import { assertStandard } from './legacy.js';

/**
 * Records the definition `provide(C, { deps, lifetime })` builds, so a bare
 * `C` in `providers` uses it. TypeScript infers `C` from the decorated class,
 * which is what checks `deps` against its constructor.
 */
export function Injectable<C extends Ctor>(
  options: { lifetime?: Lifetime } & DepsFor<C>,
): (target: C, context: ClassDecoratorContext<C>) => void {
  return (_target, context) => {
    assertStandard(context, 'Injectable');
    const { deps, lifetime } = options as {
      deps?: readonly unknown[];
      lifetime?: Lifetime;
    };
    writeInjectable(context.metadata, { deps, lifetime });
  };
}
