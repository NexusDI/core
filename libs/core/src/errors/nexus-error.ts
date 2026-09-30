import { lineOf } from './line.js';

/** Every copy of core writes it, so isNexusError works across copies. */
export const ERROR_BRAND: unique symbol = Symbol.for('nexusdi.error') as never;

type Reserved = 'message' | 'name' | 'stack' | 'cause';

/** An error's fields. `code` may appear only to pick the code of a class with several. */
export type ErrorFields = object & { readonly [K in Reserved]?: never };

export interface NexusErrorOptions extends ErrorOptions {
  /** The whole message body, for an error whose text its raiser owns. */
  readonly text?: string;
  /** Own non-enumerable properties, for what a formatter needs beyond the fields. */
  readonly hidden?: Readonly<Record<string, unknown>>;
}

/** Errors built with `text`: their raiser owns the words, so no formatter rewrites them. */
const OWN_TEXT = new WeakSet<Error>();

/** True for an error built with the `text` option. */
export function ownsText(error: Error): boolean {
  return OWN_TEXT.has(error);
}

/**
 * The base of every error NexusDI raises. One constructor does all the
 * work: the fields become own enumerable properties; code, name and the
 * brand are own non-enumerable ones; the message is the one-line form.
 */
export class NexusError<C extends string = string> extends Error {
  declare readonly code: C;

  /**
   * `docs` is the base url the one-line message links to, `DOCS_URL`
   * when absent. `errorBase` passes it; a direct subclass leaves it out.
   */
  constructor(
    code: C,
    name: string,
    fields: ErrorFields,
    options?: NexusErrorOptions,
    docs?: string,
  ) {
    super(`[${code}] ${options?.text ?? lineOf(code, fields, docs)}`, options);
    for (const [key, value] of Object.entries(fields))
      if (key !== 'code') (this as Record<string, unknown>)[key] = value;
    for (const [key, value] of Object.entries(options?.hidden ?? {}))
      Object.defineProperty(this, key, { value, enumerable: false });
    Object.defineProperties(this, {
      code: { value: code, enumerable: false },
      name: { value: name, enumerable: false, writable: true },
      [ERROR_BRAND]: { value: true, enumerable: false },
    });
    if (options?.text !== undefined) OWN_TEXT.add(this);
  }
}

/**
 * The base a thin error class extends: `class X extends errorBase<'CODE',
 * XFields>('CODE', 'X') {}`. `code` may be a function of the fields for a
 * class that carries several codes. `docs` is the base url the one-line
 * message links to, followed by the code: `DOCS_URL` when absent, which
 * first-party packages keep; a third-party package passes its own.
 */
export function errorBase<C extends string, F extends ErrorFields>(
  code: C | ((fields: F) => C),
  name: string,
  docs?: string,
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
        docs,
      );
    }
  } as never;
}
