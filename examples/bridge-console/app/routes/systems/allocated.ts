import type { ShipReading } from '@nexusdi/meridian-systems';

/** The power the router granted the load `id`, in W, or 0 when the ship lists no such load. */
export function allocated(ship: ShipReading, id: string): number {
  return ship.power.loads.find((load) => load.id === id)?.allocated ?? 0;
}
