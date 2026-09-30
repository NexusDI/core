/** The owner defines its brand once and exports it. */
export const ERROR_BRAND: unique symbol = Symbol.for('nexusdi.error') as never;

// A well-known symbol polyfill carries no package's key.
(Symbol as { dispose?: symbol }).dispose ??= Symbol.for('Symbol.dispose');
