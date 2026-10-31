import type { ColourRole } from './colour.js';

/**
 * The export kinds the reference loader tags an entry with, as the class
 * `meridian-kind-<kind>` spells them (the loader's `kindSlug` turns
 * `typeAlias` into `type-alias`).
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

/**
 * An export kind shows as a neutral chip with its word (design system spec
 * section 4.6). An error class is a kind of export, so it takes the same chip
 * as the rest and never an alarm hue.
 */
export const kindChip = {
  text: 'textSecondary',
  border: 'seam',
} as const satisfies Record<string, ColourRole>;
