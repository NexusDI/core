import { LegacyDecoratorsError } from '../errors/index.js';

/**
 * Under experimentalDecorators, TypeScript calls a class decorator with the
 * class alone and a member decorator with (prototype, key, descriptor). A
 * standard decorator always receives a context object with a `kind`.
 */
export function assertStandard(context: unknown, decorator: string): void {
  if (
    typeof context !== 'object' ||
    context === null ||
    typeof (context as { kind?: unknown }).kind !== 'string'
  ) {
    throw new LegacyDecoratorsError({ decorator });
  }
}
