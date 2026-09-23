import { describe, it, expect } from 'vitest';
import {
  isToken,
  isTokenType,
  isProvider,
  isFactory,
  isService,
  isContainer,
} from './guards';
import { Token } from './token';
import type { IContainer } from './types';
import { Service, Provider } from './decorators';

/**
 * Guards: Ensures all public guard functions work as expected for valid and invalid cases
 */
describe('Guards', () => {
  describe('isToken', () => {
    it('should return true for real Token instances', () => {
      const token = new Token('TEST');
      expect(isToken(token)).toBe(true);
    });

    it('should return false for non-tokens', () => {
      expect(isToken({})).toBe(false);
      expect(isToken(null)).toBe(false);
      expect(isToken(undefined)).toBe(false);
      expect(isToken('token')).toBe(false);
      expect(isToken(class Foo {})).toBe(false);
    });

    it('should still recognise a token after a bundler renames the Token class', () => {
      // esbuild renames a top-level class to dodge a scope collision when it
      // flattens two modules that both declare a top-level `Token` binding;
      // `constructor.name` stops reading "Token" even though the instance
      // itself is unchanged.
      const token = new Token('RENAMED');
      const descriptor = Object.getOwnPropertyDescriptor(Token, 'name');
      if (!descriptor) throw new Error('Token.name has no descriptor');
      Object.defineProperty(Token, 'name', { ...descriptor, value: '_Token' });
      try {
        expect(token.constructor.name).toBe('_Token');
        expect(isToken(token)).toBe(true);
      } finally {
        Object.defineProperty(Token, 'name', descriptor);
      }
    });

    it('should recognise a branded object from another copy of the Token class', () => {
      // Simulates two copies of @nexusdi/core ending up in one bundle: an
      // instance made by the *other* copy's `Token` class is not
      // `instanceof` this one, but both copies brand with the same
      // `Symbol.for('nexusdi.token')` registered symbol, which is looked up
      // in the process-global registry rather than compared by class
      // identity, so this hardcodes that key instead of importing it --
      // pinning the actual cross-copy contract, not just this module's
      // internal consistency.
      const foreignToken = Object.create(null);
      Object.defineProperty(foreignToken, Symbol.for('nexusdi.token'), {
        value: true,
        enumerable: false,
      });
      expect(isToken(foreignToken)).toBe(true);
    });
  });

  describe('isTokenType', () => {
    it('should return true for class constructors', () => {
      class Test {}
      expect(isTokenType(Test)).toBe(true);
    });
    it('should return true for symbols', () => {
      const sym = Symbol('SYM');
      expect(isTokenType(sym)).toBe(true);
    });
    it('should return true for Token instances', () => {
      const token = new Token('TEST');
      expect(isTokenType(token)).toBe(true);
    });
    it('should return false for strings, numbers, objects, null, undefined', () => {
      expect(isTokenType('string')).toBe(false);
      expect(isTokenType(123)).toBe(false);
      expect(isTokenType({})).toBe(false);
      expect(isTokenType(null)).toBe(false);
      expect(isTokenType(undefined)).toBe(false);
    });
  });

  describe('isProvider', () => {
    it('should return true for objects with useClass, useValue, or useFactory', () => {
      class Test {}
      expect(isProvider({ useClass: Test })).toBe(true);
      expect(isProvider({ useValue: 123 })).toBe(true);
      expect(isProvider({ useFactory: () => 1 })).toBe(true);
    });
    it('should return false for objects without provider keys', () => {
      expect(isProvider({})).toBe(false);
      expect(isProvider({ foo: 'bar' })).toBe(false);
      expect(isProvider(null)).toBe(false);
      expect(isProvider(undefined)).toBe(false);
    });
  });

  describe('isFactory', () => {
    it('should return true for objects with useFactory function', () => {
      expect(isFactory({ useFactory: () => 1 })).toBe(true);
    });
    it('should return false for objects without useFactory or with non-function', () => {
      expect(isFactory({ useFactory: 123 })).toBe(false);
      expect(isFactory({ useClass: class {} })).toBe(false);
      expect(isFactory({})).toBe(false);
      expect(isFactory(null)).toBe(false);
      expect(isFactory(undefined)).toBe(false);
    });
  });

  describe('isService', () => {
    it('should return true for decorated service/provider classes', () => {
      @Service()
      class TestService {}
      expect(isService(TestService)).toBe(true);
      @Provider()
      class TestProvider {}
      expect(isService(TestProvider)).toBe(true);
    });
    it('should return false for undecorated class constructors', () => {
      class NotAService {}
      expect(isService(NotAService)).toBe(false);
    });
  });

  describe('isContainer', () => {
    it('should return true for objects implementing IContainer', () => {
      const fake = {
        get: () => 1,
        set: () => {},
        has: () => true,
        resolve: () => 1,
      } as unknown as IContainer;
      expect(isContainer(fake)).toBe(true);
    });
    it('should return false for objects missing required methods', () => {
      expect(isContainer({ get: () => 1, set: () => {} })).toBe(false);
      expect(isContainer({})).toBe(false);
      expect(isContainer(null)).toBe(false);
      expect(isContainer(undefined)).toBe(false);
    });
  });
});
