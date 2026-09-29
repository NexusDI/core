import './polyfill/symbol-metadata.js';

import {
  declareClass,
  type Ctor,
  type Dep,
  type DepsFor,
  type Lifetime,
} from '@nexusdi/core';

import { assertStandard } from './legacy.js';

/**
 * The `deps` and `lifetime` that `options` sets on itself. A key only the
 * prototype chain supplies is left out, so a polluted Object.prototype
 * cannot supply one (SEC-003).
 */
function pickOwnDeps(options: object): {
  deps?: readonly Dep[];
  lifetime?: Lifetime;
} {
  const picked: { deps?: readonly Dep[]; lifetime?: Lifetime } = {};
  if (Object.hasOwn(options, 'deps'))
    picked.deps = (options as { deps: readonly Dep[] }).deps;
  if (Object.hasOwn(options, 'lifetime'))
    picked.lifetime = (options as { lifetime: Lifetime }).lifetime;
  return picked;
}

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
    declareClass(context.metadata, pickOwnDeps(options));
  };
}
