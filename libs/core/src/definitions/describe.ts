import { DEFINITION_BRAND } from './brand.js';
import { MultiToken } from './token.js';

/**
 * The name of a value any copy of core branded, from its own fields: a
 * `description` names a Token, a `name` names a module, and a value with
 * neither is a provider. A MultiToken another copy made carries the fields of
 * a Token, so it reads as one. Undefined for a value with no brand, or one
 * whose Proxy trap throws.
 */
function definitionName(value: object): string | undefined {
  try {
    if (Object.getOwnPropertyDescriptor(value, DEFINITION_BRAND) === undefined)
      return undefined;
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
