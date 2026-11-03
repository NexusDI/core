import type { NexusRequest } from '@nexusdi/core';
import type { MapDefinition, MapId } from '@nexusdi/meridian-systems/maps';

import type { DeckMapsOptions } from './contracts.js';

declare module '@nexusdi/core' {
  interface NexusRequest {
    /** The map a deck scope opens. `MAP` reads it from `DeckMapsOptions.maps`. */
    map?: MapId;
  }
}

/** A request names a map the options do not hold, or names none. */
export class UnknownMapError extends Error {
  readonly code = 'MERIDIAN_DECK_UNKNOWN_MAP';

  constructor(
    readonly map: string | undefined,
    readonly known: readonly string[],
  ) {
    super(
      map === undefined
        ? `The request names no map. Pass createScope({ request: { map } }) with one of: ${known.join(', ')}.`
        : `The request names the map "${map}", which DeckMaps does not hold. It holds: ${known.join(', ')}.`,
    );
    this.name = 'UnknownMapError';
  }
}

/** The definitions a map function already returned, so each loads once per options object. */
const loaded = new WeakMap<
  DeckMapsOptions,
  Map<MapId, Promise<MapDefinition>>
>();

/** The factory of `MAP`: the map `request.map` names, loaded if the options hold a function. */
export function mapOfRequest(
  request: NexusRequest,
  options: DeckMapsOptions,
): Promise<MapDefinition> {
  const id = request.map;
  const entry = id === undefined ? undefined : options.maps[id];
  if (id === undefined || entry === undefined) {
    return Promise.reject(new UnknownMapError(id, Object.keys(options.maps)));
  }
  if (typeof entry !== 'function') return Promise.resolve(entry);
  let byId = loaded.get(options);
  if (byId === undefined) {
    byId = new Map();
    loaded.set(options, byId);
  }
  let pending = byId.get(id);
  if (pending === undefined) {
    pending = entry();
    byId.set(id, pending);
    const own = byId;
    pending.catch(() => {
      if (own.get(id) === pending) own.delete(id);
    });
  }
  return pending;
}
