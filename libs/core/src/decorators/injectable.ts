import '../polyfill/symbol-metadata.js';

import {
  writeInjectable,
  type InjectableMetadata,
} from '../definitions/metadata.js';
import { pickOwn } from '../definitions/own-keys.js';
import type { DepsFor } from '../definitions/provide.js';
import type { Ctor, Lifetime } from '../definitions/types.js';
import { assertStandard } from './legacy.js';

/**
 * Records the definition `provide(C, { deps, lifetime })` builds, so a bare
 * `C` in `providers` uses it. Only the keys `options` sets on itself are
 * recorded (SEC-003). TypeScript infers `C` from the decorated class,
 * which is what checks `deps` against its constructor.
 */
export function Injectable<C extends Ctor>(
  options: { lifetime?: Lifetime } & DepsFor<C>,
): (target: C, context: ClassDecoratorContext<C>) => void {
  return (_target, context) => {
    assertStandard(context, 'Injectable');
    writeInjectable(
      context.metadata,
      pickOwn(options, ['deps', 'lifetime']) as InjectableMetadata,
    );
  };
}
