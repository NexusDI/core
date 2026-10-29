import { describe, expect, it } from 'vitest';

import deck from '../../deck/meridian.deck.json';

import type {
  CompartmentId,
  CompartmentPlan,
  DeckPlan,
  DoorPlan,
} from './contracts';
import { checkDeckPlan } from './deck-plan-check';

const plan = deck satisfies DeckPlan;

/** The deck with `room`'s plan changed by `change`. */
function withRoom(
  room: CompartmentId,
  change: Partial<CompartmentPlan>,
): DeckPlan {
  return {
    ...plan,
    compartments: plan.compartments.map((entry) =>
      entry.id === room ? { ...entry, ...change } : entry,
    ),
  };
}

/** The deck with `door`'s plan changed by `change`. */
function withDoor(door: string, change: Partial<DoorPlan>): DeckPlan {
  return {
    ...plan,
    doors: plan.doors.map((entry) =>
      entry.id === door ? { ...entry, ...change } : entry,
    ),
  };
}

describe('checkDeckPlan', () => {
  it('passes the ship deck', () => {
    expect(() => checkDeckPlan(plan)).not.toThrow();
  });

  it('refuses a deck plan that leaves out a compartment', () => {
    const partial: DeckPlan = {
      ...plan,
      compartments: plan.compartments.filter((room) => room.id !== 'airlock'),
    };
    expect(() => checkDeckPlan(partial)).toThrow(
      "The deck plan has no compartment 'airlock'.",
    );
  });

  it('refuses a deck plan that names an unknown compartment', () => {
    const extra: DeckPlan = {
      ...plan,
      compartments: [
        ...plan.compartments,
        { ...plan.compartments[0], id: 'galley' },
      ],
    };
    expect(() => checkDeckPlan(extra)).toThrow(/'galley'/);
  });

  it('refuses a deck plan that lists one compartment twice', () => {
    const twice: DeckPlan = {
      ...plan,
      compartments: [...plan.compartments, plan.compartments[1]],
    };
    expect(() => checkDeckPlan(twice)).toThrow(
      "The deck plan names compartment 'habitat' twice.",
    );
  });

  it.each([
    [
      'an unknown device',
      withRoom('bridge', { equipment: ['heater', 'fan'] }),
      "The deck plan gives compartment 'bridge' an unknown device 'fan'.",
    ],
    [
      'a device twice',
      withRoom('bridge', { equipment: ['heater', 'heater'] }),
      "The deck plan gives compartment 'bridge' the device 'heater' twice.",
    ],
    [
      'a pump with no reservoir',
      withRoom('airlock', { pumpReservoir: undefined }),
      "The deck plan gives compartment 'airlock' a pump and no pumpReservoir.",
    ],
    [
      'a reservoir with no pump',
      withRoom('habitat', { pumpReservoir: 'bridge' }),
      "The deck plan gives compartment 'habitat' a pumpReservoir and no pump.",
    ],
    [
      'an unknown reservoir',
      withRoom('airlock', { pumpReservoir: 'galley' }),
      "The deck plan pumps compartment 'airlock' to an unknown compartment 'galley'.",
    ],
    [
      'a reservoir that is the pump room',
      withRoom('airlock', { pumpReservoir: 'airlock' }),
      "The deck plan pumps compartment 'airlock' to itself.",
    ],
  ])('refuses a deck plan with %s', (_, deckPlan, message) => {
    expect(() => checkDeckPlan(deckPlan)).toThrow(message);
  });

  it.each([
    [
      'an unknown door',
      {
        ...plan,
        doors: [
          ...plan.doors,
          { id: 'bridge-galley', between: ['bridge', 'habitat'], area: 1 },
        ],
      },
      "The deck plan names an unknown door 'bridge-galley'.",
    ],
    [
      'a door twice',
      { ...plan, doors: [...plan.doors, plan.doors[2]] },
      "The deck plan names door 'habitat-airlock' twice.",
    ],
    [
      'a door left out',
      {
        ...plan,
        doors: plan.doors.filter((door) => door.id !== 'airlock-outer'),
      },
      "The deck plan has no door 'airlock-outer'.",
    ],
    [
      'a door with one side',
      withDoor('bridge-habitat', { between: ['bridge'] }),
      'The deck plan gives door \'bridge-habitat\' the sides ["bridge"]. A door joins two compartments, or one compartment and space.',
    ],
    [
      'a door with three sides',
      withDoor('bridge-habitat', { between: ['bridge', 'habitat', 'airlock'] }),
      'The deck plan gives door \'bridge-habitat\' the sides ["bridge","habitat","airlock"]. A door joins two compartments, or one compartment and space.',
    ],
    [
      'a door to one room on both sides',
      withDoor('bridge-habitat', { between: ['bridge', 'bridge'] }),
      'The deck plan gives door \'bridge-habitat\' the sides ["bridge","bridge"]. A door joins two compartments, or one compartment and space.',
    ],
    [
      'a door to space on both sides',
      withDoor('airlock-outer', { between: ['space', 'space'] }),
      'The deck plan gives door \'airlock-outer\' the sides ["space","space"]. A door joins two compartments, or one compartment and space.',
    ],
    [
      'a door to an unknown compartment',
      withDoor('habitat-airlock', { between: ['habitat', 'galley'] }),
      'The deck plan gives door \'habitat-airlock\' the sides ["habitat","galley"]. A door joins two compartments, or one compartment and space.',
    ],
    [
      'a flood charge of 0 mol',
      withRoom('bridge', { floodCharge: 0 }),
      "The deck plan gives compartment 'bridge' a floodCharge of 0. A charge is a positive finite number of moles.",
    ],
    [
      'a negative flood charge',
      withRoom('habitat', { floodCharge: -5 }),
      "The deck plan gives compartment 'habitat' a floodCharge of -5. A charge is a positive finite number of moles.",
    ],
    [
      'an infinite flood charge',
      withRoom('habitat', { floodCharge: Number.POSITIVE_INFINITY }),
      "The deck plan gives compartment 'habitat' a floodCharge of Infinity. A charge is a positive finite number of moles.",
    ],
    [
      'a flood charge that is no number',
      withRoom('habitat', { floodCharge: Number.NaN }),
      "The deck plan gives compartment 'habitat' a floodCharge of NaN. A charge is a positive finite number of moles.",
    ],
    [
      'a flood charge that is a string',
      withRoom('habitat', { floodCharge: '5' as unknown as number }),
      "The deck plan gives compartment 'habitat' a floodCharge of 5. A charge is a positive finite number of moles.",
    ],
  ])('refuses a deck plan with %s', (_, deckPlan: DeckPlan, message) => {
    expect(() => checkDeckPlan(deckPlan)).toThrow(message);
  });
});
