import { InvalidTokenError } from '../errors/index.js';
import { describeValue } from './describe.js';
import type { Class } from './types.js';

declare const TYPE: unique symbol;
declare const ELEMENT: unique symbol;

function checkDescription(description: unknown): string {
  if (typeof description !== 'string' || description === '') {
    throw new InvalidTokenError({
      received: describeValue(description),
      reason:
        'is not a token description. A Token needs a non-empty description string.',
    });
  }
  return description;
}

/**
 * A typed token for a value that is not a class.
 *
 * The description appears in errors, in `graph()` and in trace events. Two
 * tokens with one description are still two tokens: tokens compare by
 * identity. The phantom `[TYPE]` field makes `Token<T>` nominal and covariant
 * in `T` and has no runtime presence.
 */
export class Token<out T> {
  declare readonly [TYPE]: T;
  readonly description: string;

  constructor(description: string) {
    this.description = checkDescription(description);
  }

  toString(): string {
    return this.description;
  }
}

/**
 * A token that collects many providers and resolves to `T[]`.
 *
 * A separate class from `Token`: if it extended `Token<T[]>`,
 * `provide(M, { useValue: [a, b] })` would type-check as one provider of the
 * whole array.
 */
export class MultiToken<out T> {
  declare readonly [ELEMENT]: T;
  readonly description: string;

  constructor(description: string) {
    this.description = checkDescription(description);
  }

  toString(): string {
    return this.description;
  }
}

/** A class, which is its own token, or a Token. */
export type InjectionToken<T> = Token<T> | Class<T>;

/** The name errors, `graph()` and trace events use for a token. */
export function displayName(token: unknown): string {
  if (token instanceof Token || token instanceof MultiToken)
    return token.description;
  if (typeof token === 'function') return token.name || '(anonymous class)';
  return describeValue(token);
}
