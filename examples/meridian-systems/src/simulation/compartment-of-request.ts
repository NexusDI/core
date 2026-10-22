import type { NexusRequest } from '@nexusdi/core';

import { UnknownCompartmentError } from '../errors';
import { COMPARTMENT_IDS, type CompartmentId } from './contracts';
import { listInWords } from './list-in-words';

/** The deck's compartments in words: `bridge, habitat, reactor-bay and airlock`. */
const ROOMS = listInWords(COMPARTMENT_IDS);

function isCompartmentId(id: string): id is CompartmentId {
  return (COMPARTMENT_IDS as readonly string[]).includes(id);
}

/**
 * The factory of `COMPARTMENT`: the compartment `request` names. Throws
 * `UnknownCompartmentError` when it names none or one the deck does not
 * have; the error leaves `compartment` out when the request names none.
 */
export function compartmentOfRequest(request: NexusRequest): CompartmentId {
  const { compartment } = request;
  if (compartment === undefined) {
    throw new UnknownCompartmentError({ expected: ROOMS });
  }
  if (!isCompartmentId(compartment)) {
    throw new UnknownCompartmentError({ compartment, expected: ROOMS });
  }
  return compartment;
}
