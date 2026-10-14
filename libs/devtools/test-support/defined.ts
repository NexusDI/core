import { expect } from 'vitest';

/** `value`, after the test checked that it exists. */
export function defined<T>(value: T | undefined): T {
  expect(value).toBeDefined();
  return value as T;
}
