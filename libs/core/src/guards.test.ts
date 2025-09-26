import { describe, it, expect } from 'vitest';
import {
  isTokenType,
  isProvider,
  isFactoryProvider,
  isService,
  isContainer,
} from './guards';
import { Token } from './token';
import type { IContainer } from './types';
import { Service } from './decorators';

/**
 * Guards: Ensures all public guard functions work as expected for valid and invalid cases
 */
describe('Guards', () => {
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
      expect(isFactoryProvider({ useFactory: () => 1 })).toBe(true);
    });
    it('should return false for objects without useFactory or with non-function', () => {
      expect(isFactoryProvider({ useFactory: 123 })).toBe(false);
      expect(isFactoryProvider({ useClass: class {} })).toBe(false);
      expect(isFactoryProvider({})).toBe(false);
      expect(isFactoryProvider(null)).toBe(false);
      expect(isFactoryProvider(undefined)).toBe(false);
    });
  });

  describe('isService', () => {
    it('should return true for decorated service/provider classes', () => {
      @Service()
      class TestService {}
      expect(isService(TestService)).toBe(true);

      @Service()
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
