import { Token } from '@nexusdi/core';

/** The name errors use for a token: a Token's description or a class's name. */
export function nameOf(token: unknown): string {
  if (token instanceof Token) return token.description;
  if (typeof token === 'function') return token.name || '(anonymous class)';
  return String(token);
}

/** A method key as errors print it. */
export function keyName(key: PropertyKey): string {
  return typeof key === 'symbol' ? `[${key.toString()}]` : String(key);
}
