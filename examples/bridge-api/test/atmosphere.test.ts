import {
  type AtmosphereReading,
  type CompartmentId,
  type IAtmosphereSensor,
  UnknownCompartmentError,
} from '@nexusdi/meridian-systems';
import { describe, expect, it } from 'vitest';

import { answerAtmosphere } from '../src/bridge/atmosphere';

const reading: AtmosphereReading<CompartmentId> = {
  compartment: 'habitat',
  tick: 0,
  temperature: 293.02,
  pressure: 101_297,
  partial: { O2: 21_220, N2: 79_028, CO2: 40, H2O: 1_009, volatiles: 0 },
};

/** A scope whose get() answers `sensor`. */
const scopeOf = (sensor: () => IAtmosphereSensor) => ({ get: sensor });

/** A scope whose get() throws `error`. */
const failing = (error: unknown) =>
  scopeOf(() => {
    throw error;
  });

const ROOMS = 'bridge, habitat, reactor-bay and airlock';
const FIX =
  'read /compartments/<id>/atmosphere with one of the compartments above.';

describe('answerAtmosphere', () => {
  it("answers 200 with the sensor's reading", () => {
    expect(answerAtmosphere(scopeOf(() => ({ read: () => reading })))).toEqual({
      status: 200,
      body: reading,
    });
  });

  it('answers 404 with the text for a compartment the deck lacks', () => {
    const error = new UnknownCompartmentError({
      compartment: 'galley',
      expected: ROOMS,
    });
    expect(answerAtmosphere(failing(error))).toEqual({
      status: 404,
      body: {
        code: 'MERIDIAN_UNKNOWN_COMPARTMENT',
        message: `No compartment is named 'galley'. The deck has ${ROOMS}.`,
        fix: FIX,
      },
    });
  });

  it('shows a percent-encoded compartment name decoded in the text', () => {
    const error = new UnknownCompartmentError({
      compartment: 'reactor%20bay',
      expected: ROOMS,
    });
    expect(answerAtmosphere(failing(error)).body).toMatchObject({
      message: `No compartment is named 'reactor bay'. The deck has ${ROOMS}.`,
    });
  });

  it('shows a name with a broken escape as the path spells it', () => {
    const error = new UnknownCompartmentError({
      compartment: '100%',
      expected: ROOMS,
    });
    expect(answerAtmosphere(failing(error)).body).toMatchObject({
      message: `No compartment is named '100%'. The deck has ${ROOMS}.`,
    });
  });

  it('answers 404 with the text for a request that names no compartment', () => {
    const error = new UnknownCompartmentError({ expected: ROOMS });
    expect(answerAtmosphere(failing(error))).toEqual({
      status: 404,
      body: {
        code: 'MERIDIAN_UNKNOWN_COMPARTMENT',
        message: `The request names no compartment. The deck has ${ROOMS}.`,
        fix: FIX,
      },
    });
  });

  it('rethrows any other throw', () => {
    const bug = new Error('the analyzer broke');
    expect(() => answerAtmosphere(failing(bug))).toThrow(bug);
  });
});
