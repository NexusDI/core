import type { ColourRole } from './colour.js';

/**
 * The export kinds the reference loader tags an entry with, as the class
 * `meridian-kind-<kind>` spells them (the loader's `kindSlug` turns
 * `typeAlias` into `type-alias`). Each kind takes a text role, so every hue is
 * already held to the text floor.
 */
export const exportKinds = [
  'error',
  'class',
  'function',
  'constant',
  'interface',
  'type-alias',
] as const;

export type ExportKind = (typeof exportKinds)[number];

export const kindRole = {
  error: 'statusFail',
  class: 'signalCyan',
  function: 'statusPass',
  constant: 'signalAmber',
  interface: 'signalMagenta',
  'type-alias': 'textSecondary',
} as const satisfies Record<ExportKind, ColourRole>;
