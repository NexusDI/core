const COMPARTMENT_PATH = /^\/compartments\/([^/?#]+)/;

/**
 * The compartment a path names, as `/compartments/<id>/...` spells it, or
 * `undefined` for any other path. The id stays percent-encoded, and
 * `COMPARTMENT` refuses one the deck does not have.
 */
export function compartmentOf(path: string): string | undefined {
  return COMPARTMENT_PATH.exec(path)?.[1];
}
