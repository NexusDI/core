import './polyfill/symbol-metadata.js';

import { declareProperty, type Dep, type Resolve } from '@nexusdi/core';

import { assertStandard } from './legacy.js';

/**
 * Records a property injection on an `accessor` field. The container sets it
 * after the constructor returns and before onInit, on every instance it
 * builds from the class. Accepts optional() and lazy(). The field may be
 * private; its type rejects a `static` accessor.
 */
export function Inject<D extends Dep>(
  dep: D,
): <This extends object>(
  target: ClassAccessorDecoratorTarget<This, Resolve<D>>,
  context: ClassAccessorDecoratorContext<This, Resolve<D>> & {
    readonly static: false;
  },
) => void {
  return (_target, context) => {
    assertStandard(context, 'Inject');
    declareProperty(context.metadata, context.name, dep, context.access);
  };
}
