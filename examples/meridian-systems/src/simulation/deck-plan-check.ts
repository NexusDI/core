import { LIFE_SUPPORT_DEVICES } from '../systems/life-support/life-support-model';

import {
  COMPARTMENT_IDS,
  type CompartmentPlan,
  type DeckPlan,
  DOOR_IDS,
} from './contracts';

/**
 * Refuses a deck plan whose compartments differ from `COMPARTMENT_IDS`, a
 * room with a bad device list or flood charge, an unpressurised room with
 * either, or a deck whose doors differ
 * from `DOOR_IDS`. Each refusal is a plain `Error`, since a bad deck is a bug
 * in the ship's files and no crew command reaches it.
 */
export function checkDeckPlan(deck: DeckPlan): void {
  const seen = new Set<string>();
  for (const room of deck.compartments) {
    if (!(COMPARTMENT_IDS as readonly string[]).includes(room.id)) {
      throw new Error(
        `The deck plan names an unknown compartment '${room.id}'.`,
      );
    }
    if (seen.has(room.id)) {
      throw new Error(`The deck plan names compartment '${room.id}' twice.`);
    }
    seen.add(room.id);
    checkEquipment(room);
    checkFloodCharge(room);
    checkVacuum(room);
  }
  for (const id of COMPARTMENT_IDS) {
    if (!seen.has(id)) {
      throw new Error(`The deck plan has no compartment '${id}'.`);
    }
  }
  checkDoors(deck);
}

/**
 * Refuses a plan whose `equipment` lists an unknown device or one device
 * twice, a pump with no `pumpReservoir` or the reverse, or a reservoir that is
 * unknown or the pump's own room.
 */
function checkEquipment(room: CompartmentPlan): void {
  const devices = new Set<string>();
  for (const device of room.equipment ?? []) {
    if (!(LIFE_SUPPORT_DEVICES as readonly string[]).includes(device)) {
      throw new Error(
        `The deck plan gives compartment '${room.id}' an unknown device '${device}'.`,
      );
    }
    if (devices.has(device)) {
      throw new Error(
        `The deck plan gives compartment '${room.id}' the device '${device}' twice.`,
      );
    }
    devices.add(device);
  }
  const reservoir = room.pumpReservoir;
  if (devices.has('pump') && reservoir === undefined) {
    throw new Error(
      `The deck plan gives compartment '${room.id}' a pump and no pumpReservoir.`,
    );
  }
  if (reservoir === undefined) return;
  if (!devices.has('pump')) {
    throw new Error(
      `The deck plan gives compartment '${room.id}' a pumpReservoir and no pump.`,
    );
  }
  if (reservoir === room.id) {
    throw new Error(`The deck plan pumps compartment '${room.id}' to itself.`);
  }
  if (!(COMPARTMENT_IDS as readonly string[]).includes(reservoir)) {
    throw new Error(
      `The deck plan pumps compartment '${room.id}' to an unknown compartment '${reservoir}'.`,
    );
  }
}

/** Refuses a flood charge that is not a positive finite number of moles. */
function checkFloodCharge(room: CompartmentPlan): void {
  const charge = room.floodCharge;
  if (charge === undefined) return;
  if (!Number.isFinite(charge) || charge <= 0) {
    throw new Error(
      `The deck plan gives compartment '${room.id}' a floodCharge of ${charge}. A charge is a positive finite number of moles.`,
    );
  }
}

/**
 * Refuses an unpressurised room that lists a device or a flood charge, since
 * a device or a flood in vacuum would act on no gas.
 */
function checkVacuum(room: CompartmentPlan): void {
  if (room.pressurised !== false) return;
  const equipment = room.equipment ?? [];
  if (equipment.length > 0) {
    throw new Error(
      `The deck plan gives the unpressurised compartment '${room.id}' the equipment ${equipment.join(', ')}. A room with no air carries no device.`,
    );
  }
  if (room.floodCharge !== undefined) {
    throw new Error(
      `The deck plan gives the unpressurised compartment '${room.id}' a floodCharge. A room with no air takes no flood.`,
    );
  }
}

/** A compartment id or `space`. */
function isSide(id: string): boolean {
  return id === 'space' || (COMPARTMENT_IDS as readonly string[]).includes(id);
}

/**
 * Refuses a deck whose doors differ from `DOOR_IDS`, or a door whose
 * `between` does not hold two distinct sides, each a compartment id or
 * `space`.
 */
function checkDoors(deck: DeckPlan): void {
  const seen = new Set<string>();
  for (const door of deck.doors) {
    if (!(DOOR_IDS as readonly string[]).includes(door.id)) {
      throw new Error(`The deck plan names an unknown door '${door.id}'.`);
    }
    if (seen.has(door.id)) {
      throw new Error(`The deck plan names door '${door.id}' twice.`);
    }
    seen.add(door.id);
    const [a, b] = door.between;
    const sides = door.between.length === 2 && a !== b;
    if (!sides || !door.between.every(isSide)) {
      throw new Error(
        `The deck plan gives door '${door.id}' the sides ${JSON.stringify(door.between)}. A door joins two compartments, or one compartment and space.`,
      );
    }
  }
  for (const id of DOOR_IDS) {
    if (!seen.has(id)) throw new Error(`The deck plan has no door '${id}'.`);
  }
}
