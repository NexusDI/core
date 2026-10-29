import { describe, expect, it } from 'vitest';

import { UnknownCompartmentError } from '../errors';

import { compartmentOfRequest } from './compartment-of-request';
import { COMPARTMENT_IDS } from './contracts';

const ROOMS =
  'bridge, habitat, reactor-bay, airlock, chart-room, computer-core, quarters, comms-relay, shuttle-bay, drone-bay, capacitor-room, engineering, ftl-core and main-drive';

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
  it.each([...COMPARTMENT_IDS])(
    'answers %s for a request that names it',
    (compartment) => {
      expect(compartmentOfRequest({ compartment })).toBe(compartment);
    },
  );

  it('refuses an unknown compartment and names the fourteen rooms', () => {
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
