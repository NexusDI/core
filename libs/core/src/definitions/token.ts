import { CoreNotSharedError, InvalidTokenError } from '../errors/index.js';
import { brand, DEFINITION_BRAND } from './brand.js';
import type { Class } from './types.js';

declare const TYPE: unique symbol;
declare const ELEMENT: unique symbol;

function checkDescription(description: unknown): string {
  if (typeof description !== 'string' || description === '') {
    const received = describeValue(description);
    // Raised before any container exists, so core keeps its text (spec §9).
    throw new InvalidTokenError(
      {
        received,
        entry: null,
        module: null,
        index: null,
        reason: 'bad-description',
        detail: [],
      },
      {
        text: `${received} is not a token description. A Token needs a non-empty description string.`,
      },
    );
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
    brand(this);
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
    brand(this);
  }

  toString(): string {
    return this.description;
  }
}

/** A class, which is its own token, or a Token. */
export type InjectionToken<T> = Token<T> | Class<T>;

/** The name core's errors, `graph()` and trace events use for a token. */
export function displayName(token: unknown): string {
  if (token instanceof Token || token instanceof MultiToken)
    return token.description;
  if (typeof token === 'function') return token.name || '(anonymous class)';
  return describeValue(token);
}

/**
 * The name of a value any copy of core branded, from its own fields. Every
 * copy brands only one kind of function, an @Module class, which reads as
 * the module its class name gives. On an object, a `description` names a
 * Token, a `name` names a module, and a value with neither is a provider. A
 * MultiToken another copy made carries the fields of a Token, so it reads as
 * one. It returns undefined for a value with no brand, or for one whose Proxy
 * trap throws.
 */
function definitionName(value: object): string | undefined {
  try {
    if (Object.getOwnPropertyDescriptor(value, DEFINITION_BRAND) === undefined)
      return undefined;
    if (typeof value === 'function')
      return `the module ${value.name || '(anonymous module)'}`;
    if (value instanceof MultiToken)
      return `the MultiToken ${value.description}`;
    const { description, name } = value as {
      description?: unknown;
      name?: unknown;
    };
    if (typeof description === 'string') return `the Token ${description}`;
    if (typeof name === 'string') return `the module ${name}`;
    return 'a provider';
  } catch {
    return undefined;
  }
}

/** The error for `value`, which another copy of core made, met at `where`. */
export function notShared(
  value: unknown,
  where: string | null,
): CoreNotSharedError {
  return new CoreNotSharedError({ received: describeValue(value), where });
}

/** A short description of any value, for the `received` field of an error. */
export function describeValue(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'undefined':
      return 'undefined';
    case 'string':
      return `the string ${JSON.stringify(value)}`;
    case 'number':
    case 'boolean':
    case 'bigint':
      return `the ${typeof value} ${String(value)}`;
    case 'symbol':
      return `the symbol ${String(value)}`;
    case 'function':
      return (
        definitionName(value) ?? `the function ${value.name || '(anonymous)'}`
      );
    default:
      return (
        definitionName(value) ??
        (Array.isArray(value) ? 'an array' : 'an object')
      );
  }
}
