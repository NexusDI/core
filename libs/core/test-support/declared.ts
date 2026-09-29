import './symbol-metadata.js';

import {
  declareClass,
  declareProperty,
  type Dep,
  type Lifetime,
} from '../src/index.js';
import type { Ctor } from '../src/definitions/types.js';

/** Gives a class the metadata @Injectable and @Inject would write, with no decorator syntax. */
export function declared<C extends Ctor>(
  cls: C,
  options: {
    readonly deps?: readonly Dep[];
    readonly lifetime?: Lifetime;
    readonly props?: readonly { readonly key: string; readonly dep: Dep }[];
  },
): C {
  const parent = Object.getPrototypeOf(cls) as {
    [Symbol.metadata]?: DecoratorMetadataObject;
  };
  const metadata = Object.create(
    parent[Symbol.metadata] ?? null,
  ) as DecoratorMetadataObject;
  if (options.deps !== undefined || options.lifetime !== undefined)
    declareClass(metadata, {
      ...(options.deps === undefined ? {} : { deps: options.deps }),
      ...(options.lifetime === undefined ? {} : { lifetime: options.lifetime }),
    });
  for (const { key, dep } of options.props ?? [])
    declareProperty(metadata, key, dep);
  Object.defineProperty(cls, Symbol.metadata, { value: metadata });
  return cls;
}
