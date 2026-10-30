/** The options launch() takes. */
export interface LaunchOptions {
  /** How many crew board. */
  readonly crew?: number;
  /** Whether the launch counts down first. */
  readonly countdown?: boolean;
}

/** Launches a ship. */
export function launch(name: string, options?: LaunchOptions): string {
  return `${name} ${options?.crew ?? 0}`;
}

/** What defineShip() returns, which no caller writes. */
export interface ShipDefinition {
  readonly hull: string;
}

/** Defines a ship. */
export function defineShip(hull: string): ShipDefinition {
  return { hull };
}

/** A dock for ships. */
export class Dock {
  /** Opens a bay, given as a type literal. */
  open(options: { readonly bay: number }): number {
    return options.bay;
  }

  /** Docks a ship, which takes no options. */
  dock(ship: ShipDefinition): string {
    return ship.hull;
  }
}
