import type { ShipGeometry } from '../../src/geometry/ship-geometry';
import {
  INTERCEPTED_CODES,
  type MapDefinition,
  type MapEffect,
} from '../../src/maps/map-definition';

/** The conditions whose outcome a container run decides. */
const CONTAINER_CONDITIONS = [
  'provider',
  'loaded',
  'objective',
  'passed',
] as const;

/** The effects that light, darken or alarm a room, a fixture or a conduit. */
const SHIP_EFFECTS = ['set', 'room', 'conduit'] as const;

/** The one map that may read a `passed` condition. */
const HUB = 'academy-hub';

const has = (value: object, key: string) => Object.hasOwn(value, key);

const shipEffect = (effect: MapEffect) =>
  SHIP_EFFECTS.some((key) => has(effect, key));

/**
 * What the map names that the geometry lacks or states a fixture lacks, and
 * the surface rules it breaks. An empty list is a pass.
 */
export function mapProblems(
  map: MapDefinition,
  geometry: ShipGeometry,
): string[] {
  const problems: string[] = [];
  const decks = new Set(geometry.decks.map((deck) => deck.id));
  const rooms = new Set(geometry.compartments.map((room) => room.id));
  const doors = new Map(geometry.doors.map((door) => [door.id, door]));
  const fixtures = new Map(
    geometry.compartments.flatMap((room) =>
      room.fixtures.map((fixture) => [fixture.id, fixture] as const),
    ),
  );
  const conduits = new Set(geometry.conduits.map((conduit) => conduit.id));
  const placeable = (id: string) =>
    rooms.has(id) || doors.has(id) || fixtures.has(id);

  const place = (where: string, id: string) => {
    if (!placeable(id))
      problems.push(`${where}: no room, door or fixture "${id}"`);
  };
  const room = (where: string, id: string) => {
    if (!rooms.has(id)) problems.push(`${where}: no room "${id}"`);
  };
  const fixtureState = (where: string, id: string, state: string) => {
    const fixture = fixtures.get(id);
    if (fixture) {
      if (!fixture.states.includes(state as never)) {
        problems.push(`${where}: fixture "${id}" has no state "${state}"`);
      }
    } else if (doors.has(id)) {
      if (state !== 'open' && state !== 'closed') {
        problems.push(`${where}: door "${id}" has no state "${state}"`);
      }
    } else {
      problems.push(`${where}: no fixture or door "${id}"`);
    }
  };

  const checkState = (where: string, state: MapDefinition['start']) => {
    for (const [id, frame] of Object.entries(state?.fixtures ?? {})) {
      if (!fixtures.has(id))
        problems.push(`${where}.fixtures: no fixture "${id}"`);
      else fixtureState(`${where}.fixtures`, id, frame);
    }
    for (const id of Object.keys(state?.doors ?? {})) {
      if (!doors.has(id)) problems.push(`${where}.doors: no door "${id}"`);
    }
    for (const id of Object.keys(state?.rooms ?? {})) {
      room(`${where}.rooms`, id);
    }
  };

  for (const deck of map.decks) {
    if (!decks.has(deck)) problems.push(`decks: no deck "${deck}"`);
  }
  if (map.camera.deck !== 'overview' && !map.decks.includes(map.camera.deck)) {
    problems.push(
      `camera.deck: "${map.camera.deck}" is not one of the map's decks`,
    );
  }
  place('camera.focus', map.camera.focus);
  if (map.camera.deck !== 'overview') {
    const onDeck = new Set(
      geometry.compartments
        .filter(
          (r) =>
            r.id === map.camera.focus ||
            r.fixtures.some((f) => f.id === map.camera.focus) ||
            doors.get(map.camera.focus)?.between.includes(r.id),
        )
        .flatMap((r) => r.decks),
    );
    if (onDeck.size > 0 && !onDeck.has(map.camera.deck)) {
      problems.push(
        `camera.focus: "${map.camera.focus}" is not on deck "${map.camera.deck}"`,
      );
    }
  }
  checkState('start', map.start);
  checkState('goal', map.goal);
  for (const id of map.directory ?? []) place('directory', id);
  for (const callout of map.callouts ?? []) place('callouts', callout.at);
  if (map.firstVisit) place('firstVisit', map.firstVisit.at);

  const restricted = map.surface !== 'demo';
  const ids = new Set<string>();
  const triggerIds = new Set((map.triggers ?? []).map((t) => t.id));
  for (const trigger of map.triggers ?? []) {
    const where = `trigger "${trigger.id}"`;
    const when = trigger.when;

    if (ids.has(trigger.id)) {
      problems.push(`${where}: the id is used by two triggers`);
    }
    ids.add(trigger.id);

    if ('select' in when) place(`${where} select`, when.select);
    if ('alarm' in when) room(`${where} alarm`, when.room);
    if ('refused' in when) {
      if (when.door && !doors.has(when.door)) {
        problems.push(`${where} refused: no door "${when.door}"`);
      }
      if (when.room) room(`${where} refused`, when.room);
    }
    if ('provider' in when && !fixtures.has(when.provider)) {
      problems.push(`${where} provider: no fixture "${when.provider}"`);
    }
    if ('passed' in when && map.id !== HUB) {
      problems.push(`${where}: passed is valid on ${HUB} alone`);
    }

    for (const effect of trigger.then) {
      if ('set' in effect)
        fixtureState(`${where} set`, effect.set, effect.state);
      if ('room' in effect) room(`${where} room`, effect.room);
      if ('conduit' in effect && !conduits.has(effect.conduit)) {
        problems.push(`${where} conduit: no conduit "${effect.conduit}"`);
      }
      if ('camera' in effect) place(`${where} camera`, effect.camera);
      if ('callout' in effect) place(`${where} callout`, effect.callout);
      if ('release' in effect && !triggerIds.has(effect.release)) {
        problems.push(`${where} release: no trigger "${effect.release}"`);
      }
    }

    if (!restricted) continue;
    const fromContainer =
      CONTAINER_CONDITIONS.some((key) => has(when, key)) ||
      ('refused' in when &&
        (INTERCEPTED_CODES as readonly string[]).includes(when.refused));
    if (!fromContainer && trigger.then.some(shipEffect)) {
      problems.push(
        `${where}: on an academy or scene map, a ship effect needs a container condition`,
      );
    }
  }
  return problems;
}

/**
 * The check on an Academy map's objectives: every `objective` trigger names
 * an objective of the mission, and every objective has a trigger.
 */
export function objectiveProblems(
  map: MapDefinition,
  objectives: readonly string[],
): string[] {
  const named = new Set(
    (map.triggers ?? []).flatMap((trigger) =>
      'objective' in trigger.when ? [trigger.when.objective] : [],
    ),
  );
  return [
    ...[...named]
      .filter((id) => !objectives.includes(id))
      .map((id) => `objective "${id}" is not an objective of the mission`),
    ...objectives
      .filter((id) => !named.has(id))
      .map((id) => `objective "${id}" has no trigger`),
  ];
}
