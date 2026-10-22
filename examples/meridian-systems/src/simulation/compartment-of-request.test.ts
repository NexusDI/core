import { describe, expect, it } from 'vitest';

import { UnknownCompartmentError } from '../errors';
import { compartmentOfRequest } from './compartment-of-request';

const ROOMS = 'bridge, habitat, reactor-bay and airlock';

/** What `compartmentOfRequest` threw, or undefined. */
function refusal(compartment?: string): unknown {
  try {
    compartmentOfRequest(compartment === undefined ? {} : { compartment });
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('compartmentOfRequest', () => {
  it.each(['bridge', 'habitat', 'reactor-bay', 'airlock'])(
    'answers %s for a request that names it',
    (compartment) => {
      expect(compartmentOfRequest({ compartment })).toBe(compartment);
    },
  );

  it('refuses an unknown compartment and names the four rooms', () => {
    const error = refusal('galley');
    expect(error).toBeInstanceOf(UnknownCompartmentError);
    expect({ ...(error as UnknownCompartmentError) }).toStrictEqual({
      compartment: 'galley',
      expected: ROOMS,
    });
  });

  it('refuses a request that names no compartment and leaves the compartment field out', () => {
    const error = refusal();
    expect(error).toBeInstanceOf(UnknownCompartmentError);
    expect({ ...(error as UnknownCompartmentError) }).toStrictEqual({
      expected: ROOMS,
    });
  });

  it('refuses an id that only an object prototype holds', () => {
    expect(refusal('toString')).toBeInstanceOf(UnknownCompartmentError);
  });
});
