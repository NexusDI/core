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

/** Refits a ship, given any part of its launch options. */
export function refit(options: Partial<LaunchOptions>): number {
  return options.crew ?? 0;
}

/** The props a panel takes. */
export interface PanelProps {
  readonly size: number;
  readonly label?: string;
}

/** Renders a panel. */
export function Panel(props: PanelProps): null {
  return props.size > 0 ? null : null;
}

/** What a listener hears, which no caller writes as options. */
export type Signal = { readonly kind: 'ping' } | { readonly kind: 'pong' };

/** A hook an app implements. */
export interface Listener {
  /** Hears one signal. */
  hear(signal: Signal): void;
}

/** The options moor() takes, whose berths are written inline. */
export interface MoorOptions {
  readonly berths?: readonly (
    { readonly bay: number; readonly crew?: number } | string
  )[];
}

/** Moors a ship at its berths. */
export function moor(options: MoorOptions): number {
  return options.berths?.length ?? 0;
}

/** The options grow() takes, which hold more of themselves. */
export interface BranchOptions {
  readonly leaf?: string;
  readonly branches?: readonly BranchOptions[];
}

/** Grows a branch. */
export function grow(options: BranchOptions): number {
  return options.branches?.length ?? 0;
}

/** Nests options deeper than the walk reads. */
export function deep(options: {
  readonly a?: {
    readonly b?: { readonly c?: { readonly d?: { readonly e?: number } } };
  };
}): boolean {
  return options.a !== undefined;
}
