/** Every copy of core writes it, so isNexusError works across copies. */
export const ERROR_BRAND: unique symbol = Symbol.for('nexusdi.error') as never;
