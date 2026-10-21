import { describe, expect, it } from 'vitest';

import { DEFINITION_BRAND } from './brand.js';
import { declareModuleClass, defineModule } from './define-module.js';
import { describeValue } from './describe.js';
import { provide } from './provide.js';
import { MultiToken, Token } from './token.js';

/** What another copy of core makes: an object with the brand and nothing this copy knows. */
const foreign = <T extends object>(value: T): T =>
  Object.defineProperty(value, Symbol.for('nexusdi.definition'), {
    value: true,
  });

describe('describeValue', () => {
  it('names a Token, a MultiToken and a module this copy made', () => {
    expect(describeValue(new Token('ReactorCore'))).toBe(
      'the Token ReactorCore',
    );
    expect(describeValue(new MultiToken('Diagnostics'))).toBe(
      'the MultiToken Diagnostics',
    );
    expect(describeValue(defineModule({ name: 'Engineering' }))).toBe(
      'the module Engineering',
    );
  });

  it('names a provider this copy made', () => {
    expect(
      describeValue(provide(new Token<string>('Nav'), { useValue: 'x' })),
    ).toBe('a provider');
  });

  it('names an @Module class as a module, whatever its static fields', () => {
    class Hangar {
      static description = 'Charts and routes';
    }
    declareModuleClass(Hangar, { name: 'Hangar' });
    expect(describeValue(Hangar)).toBe('the module Hangar');
    const Unnamed = Object.defineProperty(class {}, 'name', { value: '' });
    declareModuleClass(Unnamed, { name: 'Bay' });
    expect(describeValue(Unnamed)).toBe('the module (anonymous module)');
    expect(describeValue(class Plain {})).toBe('the function Plain');
  });

  it('names a value another copy made by its own fields', () => {
    expect(describeValue(foreign({ description: 'meridian/NavCharts' }))).toBe(
      'the Token meridian/NavCharts',
    );
    expect(describeValue(foreign({ name: 'Cartography' }))).toBe(
      'the module Cartography',
    );
    expect(describeValue(foreign({}))).toBe('a provider');
  });

  it('keeps an object without the brand an object', () => {
    expect(describeValue({})).toBe('an object');
    expect(describeValue({ description: 'Nav' })).toBe('an object');
    expect(
      describeValue(Object.create({ [DEFINITION_BRAND]: true }) as object),
    ).toBe('an object');
  });

  it('reads a Proxy whose traps throw as an object', () => {
    const trap = (): never => {
      throw new Error('trap');
    };
    const hostile = new Proxy(
      {},
      { get: trap, getOwnPropertyDescriptor: trap, has: trap, ownKeys: trap },
    );
    expect(describeValue(hostile)).toBe('an object');
  });
});
