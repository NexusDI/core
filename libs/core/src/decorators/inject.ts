import '../polyfill/symbol-metadata.js';

import { appendProp } from '../definitions/metadata.js';
import type { Dep, Resolve } from '../definitions/modifiers.js';
import { assertStandard } from './legacy.js';

/**
 * Records a property injection on an `accessor` field. The container sets it
 * after the constructor returns and before onInit, on every instance it
 * builds from the class. Accepts optional() and lazy().
 */
export function Inject<D extends Dep>(
  dep: D,
): <This>(
  target: ClassAccessorDecoratorTarget<This, Resolve<D>>,
  context: ClassAccessorDecoratorContext<This, Resolve<D>>,
) => void {
  return (_target, context) => {
    assertStandard(context, 'Inject');
    appendProp(context.metadata, {
      key: context.name,
      dep,
      set: (target, value) =>
        context.access.set(target as never, value as never),
    });
  };
}
