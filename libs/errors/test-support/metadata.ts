import { declareClass, declareProperty } from '@nexusdi/core';

// Core ships no Symbol.metadata polyfill, and the key below needs it under
// Node versions that do not define Symbol.metadata.
(Symbol as { metadata?: symbol }).metadata ??= Symbol.for('Symbol.metadata');

/**
 * Gives `cls` the metadata `declare` writes, as a standard decorator call on
 * the class would. The tests of this package run without a decorator
 * transform, so they write class metadata through core's functions.
 */
function withMetadata(
  cls: object,
  declare: (metadata: DecoratorMetadataObject) => void,
): void {
  const metadata = Object.create(null) as DecoratorMetadataObject;
  declare(metadata);
  Object.defineProperty(cls, Symbol.metadata, { value: metadata });
}

/** Declares `options` on `cls` as `@Injectable(options)` would, whatever the options hold. */
export function injectable(
  cls: abstract new (...args: never[]) => unknown,
  options: object,
): void {
  withMetadata(cls, (metadata) => declareClass(metadata, options as never));
}

/** Declares a property injection of `dep` on `key` of `cls` as `@Inject(dep)` would, whatever `dep` is. */
export function inject(cls: object, key: string, dep: unknown): void {
  withMetadata(cls, (metadata) =>
    declareProperty(metadata, key, dep as never, { set: () => undefined }),
  );
}
