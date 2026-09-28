import { lineOf } from './line.js';

/** Every copy of core writes it, so isNexusError works across copies. */
export const ERROR_BRAND: unique symbol = Symbol.for('nexusdi.error') as never;

type Reserved = 'message' | 'name' | 'stack' | 'cause';

/** An error's fields. `code` may appear only to pick the code of a class with several. */
export type ErrorFields = object & { readonly [K in Reserved]?: never };

export interface NexusErrorOptions extends ErrorOptions {
  /** The whole message body, for an error whose text its raiser owns. */
  readonly text?: string;
}

/**
 * The base of every error NexusDI raises. One constructor does all the
 * work: the fields become own enumerable properties; code, name and the
 * brand are own non-enumerable ones; the message is the one-line form.
 */
export class NexusError<C extends string = string> extends Error {
  declare readonly code: C;

  constructor(
    code: C,
    name: string,
    fields: ErrorFields,
    options?: NexusErrorOptions,
  ) {
    super(`[${code}] ${options?.text ?? lineOf(code, fields)}`, options);
    for (const [key, value] of Object.entries(fields))
      if (key !== 'code') (this as Record<string, unknown>)[key] = value;
    Object.defineProperties(this, {
      code: { value: code, enumerable: false },
      name: { value: name, enumerable: false, writable: true },
      [ERROR_BRAND]: { value: true, enumerable: false },
    });
  }
}

/**
 * The base a thin error class extends: `class X extends errorBase<'CODE',
 * XFields>('CODE', 'X') {}`. `code` may be a function of the fields for a
 * class that carries several codes.
 */
export function errorBase<C extends string, F extends ErrorFields>(
  code: C | ((fields: F) => C),
  name: string,
): new (
  fields: F,
  options?: NexusErrorOptions,
) => NexusError<C> & Readonly<Omit<F, 'code'>> {
  return class extends NexusError<C> {
    constructor(fields: F, options?: NexusErrorOptions) {
      super(
        typeof code === 'function' ? code(fields) : code,
        name,
        fields,
        options,
      );
    }
  } as never;
}
