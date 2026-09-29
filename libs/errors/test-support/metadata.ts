import { Inject, Injectable } from '@nexusdi/core';

/**
 * Gives `cls` the metadata `decorate` writes, as a standard decorator call
 * on the class would. The tests of this package run without a decorator
 * transform, so `decorate` calls @Injectable or @Inject by hand.
 */
function withMetadata(
  cls: object,
  decorate: (metadata: DecoratorMetadataObject) => void,
): void {
  const metadata = Object.create(null) as DecoratorMetadataObject;
  decorate(metadata);
  Object.defineProperty(cls, Symbol.metadata, { value: metadata });
}

/** Applies `@Injectable(options)` to `cls`, whatever the options hold. */
export function injectable(
  cls: abstract new (...args: never[]) => unknown,
  options: object,
): void {
  withMetadata(cls, (metadata) =>
    Injectable(options as never)(
      cls as never,
      {
        kind: 'class',
        name: cls.name,
        metadata,
      } as never,
    ),
  );
}

/** Applies `@Inject(dep)` to an accessor `key` of `cls`, whatever `dep` is. */
export function inject(cls: object, key: string, dep: unknown): void {
  withMetadata(cls, (metadata) =>
    Inject(dep as never)(
      undefined as never,
      {
        kind: 'accessor',
        name: key,
        metadata,
        access: { set: () => undefined },
      } as never,
    ),
  );
}
