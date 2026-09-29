import '../../test-support/symbol-metadata.js';

import { describe, expect, it } from 'vitest';

import {
  declareClass,
  declareProperty,
  readInjectable,
  readProps,
} from './metadata.js';
import { Token } from './token.js';

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

const REACTOR = new Token<string>('ReactorCore');
const A = new Token<string>('A');
const B = new Token<string>('B');

describe('readInjectable', () => {
  it('reads nothing from a class without metadata', () => {
    expect(readInjectable(class Plain {})).toBeUndefined();
  });

  it('reads the deps and lifetime written for a class', () => {
    class ShipComputer {}
    declareClass(decorate(ShipComputer), {
      deps: [REACTOR],
      lifetime: 'transient',
    });
    expect(readInjectable(ShipComputer)).toEqual({
      deps: [REACTOR],
      lifetime: 'transient',
    });
  });

  it('inherits the parent entry when the subclass wrote none', () => {
    class Parent {}
    class Child extends Parent {}
    const parent = decorate(Parent);
    declareClass(parent, { deps: [A], lifetime: undefined });
    decorate(Child, parent);
    expect(readInjectable(Child)).toEqual({ deps: [A], lifetime: undefined });
  });

  it('uses the subclass entry when the subclass wrote one', () => {
    class Parent {}
    class Child extends Parent {}
    const parent = decorate(Parent);
    declareClass(parent, { deps: [A], lifetime: undefined });
    declareClass(decorate(Child, parent), {
      deps: [B],
      lifetime: 'scoped',
    });
    expect(readInjectable(Child)).toEqual({ deps: [B], lifetime: 'scoped' });
    expect(readInjectable(Parent)).toEqual({
      deps: [A],
      lifetime: undefined,
    });
  });
});

describe('declareProperty', () => {
  it('writes to the subclass own list and leaves the parent list unchanged', () => {
    class Parent {}
    class Child extends Parent {}
    const parent = decorate(Parent);
    declareProperty(parent, 'charts', A);
    declareProperty(decorate(Child, parent), 'link', B);
    expect(readProps(Parent).map((p) => p.key)).toEqual(['charts']);
  });
});

describe('readProps', () => {
  it('returns the parent properties first, then the subclass properties', () => {
    class Parent {}
    class Child extends Parent {}
    const parent = decorate(Parent);
    declareProperty(parent, 'charts', A);
    declareProperty(decorate(Child, parent), 'link', B);
    expect(readProps(Child).map((p) => p.key)).toEqual(['charts', 'link']);
  });

  it('returns nothing for a class without metadata', () => {
    expect(readProps(class Plain {})).toEqual([]);
  });
});
