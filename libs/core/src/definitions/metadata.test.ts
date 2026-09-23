import '../polyfill/symbol-metadata.js';

import { describe, expect, it } from 'vitest';

import {
  appendProp,
  readInjectable,
  readProps,
  writeInjectable,
  type PropMetadata,
} from './metadata.js';

/** Gives a class the metadata object standard decorators would create. */
function decorate<T extends object>(
  cls: T,
  parent?: object,
): DecoratorMetadataObject {
  const metadata = Object.create(parent ?? null) as DecoratorMetadataObject;
  Object.defineProperty(cls, Symbol.metadata, {
    value: metadata,
    configurable: true,
  });
  return metadata;
}

const prop = (key: string): PropMetadata => ({
  key,
  dep: key,
  set: () => undefined,
});

describe('readInjectable', () => {
  it('reads nothing from a class without metadata', () => {
    expect(readInjectable(class Plain {})).toBeUndefined();
  });

  it('reads the deps and lifetime written for a class', () => {
    class ShipComputer {}
    writeInjectable(decorate(ShipComputer), {
      deps: ['ReactorCore'],
      lifetime: 'transient',
    });
    expect(readInjectable(ShipComputer)).toEqual({
      deps: ['ReactorCore'],
      lifetime: 'transient',
    });
  });

  it('inherits the parent entry when the subclass wrote none', () => {
    class Parent {}
    class Child extends Parent {}
    const parent = decorate(Parent);
    writeInjectable(parent, { deps: ['A'], lifetime: undefined });
    decorate(Child, parent);
    expect(readInjectable(Child)).toEqual({ deps: ['A'], lifetime: undefined });
  });

  it('uses the subclass entry when the subclass wrote one', () => {
    class Parent {}
    class Child extends Parent {}
    const parent = decorate(Parent);
    writeInjectable(parent, { deps: ['A'], lifetime: undefined });
    writeInjectable(decorate(Child, parent), {
      deps: ['B'],
      lifetime: 'scoped',
    });
    expect(readInjectable(Child)).toEqual({ deps: ['B'], lifetime: 'scoped' });
    expect(readInjectable(Parent)).toEqual({
      deps: ['A'],
      lifetime: undefined,
    });
  });
});

describe('appendProp', () => {
  it('writes to the subclass own list and leaves the parent list unchanged', () => {
    class Parent {}
    class Child extends Parent {}
    const parent = decorate(Parent);
    appendProp(parent, prop('charts'));
    appendProp(decorate(Child, parent), prop('link'));
    expect(readProps(Parent).map((p) => p.key)).toEqual(['charts']);
  });
});

describe('readProps', () => {
  it('returns the parent properties first, then the subclass properties', () => {
    class Parent {}
    class Child extends Parent {}
    const parent = decorate(Parent);
    appendProp(parent, prop('charts'));
    appendProp(decorate(Child, parent), prop('link'));
    expect(readProps(Child).map((p) => p.key)).toEqual(['charts', 'link']);
  });

  it('returns nothing for a class without metadata', () => {
    expect(readProps(class Plain {})).toEqual([]);
  });
});
