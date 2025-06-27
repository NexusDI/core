import { describe, it, expect } from 'vitest';
import { setMetadata, getMetadata } from './helpers';

/**
 * Helpers: Ensures setMetadata and getMetadata work as expected for Symbol.metadata
 */
describe('Helpers', () => {
  it('should set and get metadata on a class', () => {
    class Test {}
    setMetadata(Test, 'foo', 123);
    expect(getMetadata(Test, 'foo')).toBe(123);
  });

  it('should return undefined for missing metadata keys', () => {
    class Test {}
    expect(getMetadata(Test, 'missing')).toBeUndefined();
  });

  it('should inherit metadata from parent class if not overridden', () => {
    class Parent {}
    setMetadata(Parent, 'bar', 'parent');
    class Child extends Parent {}
    expect(getMetadata(Child, 'bar')).toBe('parent');
  });

  it('should allow setting metadata on subclass independently', () => {
    class Parent {}
    class Child extends Parent {}
    setMetadata(Child, 'baz', 'child');
    expect(getMetadata(Child, 'baz')).toBe('child');
    expect(getMetadata(Parent, 'baz')).toBeUndefined();
  });
});
