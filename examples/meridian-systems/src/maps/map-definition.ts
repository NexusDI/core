import type { RefusalCode } from '../errors';
import type { PropState } from '../geometry/ship-geometry';
import type { ShipReading } from '../simulation/contracts';
import type { AlarmCode } from '../systems/safety/contracts';

/** The id of a map: the `id` field of `deck/maps/<id>.map.json`. */
export type MapId = string;

/** Which runtime surface opens the map. The guard applies the rules of each. */
export type MapSurface = 'demo' | 'academy' | 'scene';

/** The four named zoom levels. */
export type ZoomLevel = 'ship' | 'deck' | 'section' | 'room';

/** The camera steps, in CSS pixels per metre. */
export type ZoomStep = 6 | 8 | 12 | 16 | 24 | 32 | 48;

export type MapZoom = ZoomLevel | ZoomStep;

/** The light of a room: on its power, off it, or flashing for an alarm. */
export type RoomLight = 'powered' | 'unpowered' | 'alarm';

/** A door has two frames whatever its kind. */
export type DoorFrame = 'open' | 'closed';

/** The hue a held conduit takes. */
export type ConduitHold = 'broken' | 'flowing' | 'shed';

export interface MapRoomState {
  readonly light?: RoomLight;
  /** The alarm code the room flashes for. */
  readonly alarm?: AlarmCode;
}

/** States by id: a fixture takes one of its `states`, a door `open` or `closed`. */
export interface MapState {
  readonly fixtures?: Readonly<Record<string, PropState>>;
  readonly doors?: Readonly<Record<string, DoorFrame>>;
  readonly rooms?: Readonly<Record<string, MapRoomState>>;
}

export interface MapCamera {
  /** A deck id, or `overview` for the stack of every deck the map names. */
  readonly deck: string;
  /** A room, door or fixture id. */
  readonly focus: string;
  readonly zoom: MapZoom;
}

export interface MapCallout {
  /** A room, door or fixture id. */
  readonly at: string;
  /** Readout names, at most four. */
  readonly show: readonly string[];
  readonly zoom?: MapZoom;
}

export interface MapFirstVisit {
  readonly at: string;
  readonly text: string;
}

/** A trace event of the provider at a fixture. */
export type ProviderEvent =
  'construct' | 'init' | 'dispose:instance' | 'missing';

export type RecordValue = string | number | boolean | null;

export type MapCondition =
  | { readonly enter: true }
  | { readonly select: string }
  | { readonly record: RecordPath; readonly is: RecordValue }
  | { readonly record: RecordPath; readonly above: number }
  | { readonly record: RecordPath; readonly below: number }
  | { readonly alarm: AlarmCode; readonly room: string }
  | {
      readonly refused: RefusalCode;
      readonly door?: string;
      readonly room?: string;
      readonly system?: string;
    }
  | { readonly provider: string; readonly event: ProviderEvent }
  | { readonly objective: string; readonly status: 'pass' | 'fail' }
  | { readonly loaded: string }
  | { readonly passed: string };

export type MapEffect =
  | { readonly set: string; readonly state: PropState }
  | { readonly room: string; readonly light: RoomLight }
  | { readonly conduit: string; readonly state: ConduitHold }
  | { readonly camera: string; readonly zoom?: MapZoom }
  | {
      readonly callout: string;
      readonly show?: readonly string[];
      readonly text?: string;
    }
  | { readonly announce: string }
  | { readonly release: string };

export interface MapTrigger {
  readonly id: string;
  readonly when: MapCondition;
  readonly then: readonly MapEffect[];
}

/** The shape of `deck/maps/<id>.map.json`, which `map.schema.json` describes. */
export interface MapDefinition {
  readonly $schema?: string;
  readonly id: MapId;
  readonly version: number;
  readonly title: string;
  readonly surface: MapSurface;
  /** The decks the map loads, in load order. */
  readonly decks: readonly string[];
  readonly camera: MapCamera;
  readonly start?: MapState;
  readonly directory?: readonly string[];
  readonly callouts?: readonly MapCallout[];
  readonly firstVisit?: MapFirstVisit;
  readonly triggers?: readonly MapTrigger[];
  /** A scene module id, or null. */
  readonly scene: string | null;
  /** Academy maps: the state a passing solution reaches. */
  readonly goal?: MapState;
}

type Leaf = string | number | boolean | null;

type LeafPaths<
  T,
  Depth extends readonly unknown[] = [],
> = Depth['length'] extends 4
  ? never
  : {
      [K in keyof T & string]-?: NonNullable<T[K]> extends Leaf
        ? K
        : NonNullable<T[K]> extends readonly unknown[]
          ? never
          : `${K}.${LeafPaths<NonNullable<T[K]>, [...Depth, unknown]>}`;
    }[keyof T & string];

/**
 * A dotted path to one scalar of a telemetry frame, such as `ftl.status`.
 * Lists and the setpoints stay out: a record condition reads what the ship
 * reports.
 */
export type RecordPath = LeafPaths<Omit<ShipReading, 'setpoints'>>;

/**
 * The record paths a `record` condition may name. A path the telemetry frame
 * lacks fails the type check.
 */
export const MAP_RECORDS = [
  'tick',
  'reactor.level',
  'reactor.thermal',
  'reactor.electric',
  'reactor.tripped',
  'coolant.temperature',
  'power.output',
  'drive.thrust',
  'drive.velocity',
  'helm.attitude',
  'helm.rate',
  'comms.status',
  'comms.sent',
  'weapons.status',
  'weapons.charge',
  'weapons.shots',
  'weapons.hits',
  'ftl.status',
  'ftl.charge',
  'ftl.sector',
  'compartments.bridge.pressure',
  'compartments.habitat.pressure',
  'compartments.reactor-bay.pressure',
  'compartments.airlock.pressure',
  'compartments.chart-room.pressure',
  'compartments.computer-core.pressure',
  'compartments.quarters.pressure',
  'compartments.comms-relay.pressure',
  'compartments.shuttle-bay.pressure',
  'compartments.drone-bay.pressure',
  'compartments.capacitor-room.pressure',
  'compartments.engineering.pressure',
  'compartments.ftl-core.pressure',
  'compartments.main-drive.pressure',
] as const satisfies readonly RecordPath[];

const ALARM_CODES = [
  'FIRE',
  'SENSOR_FAULT',
  'HYPOXIA',
  'CO2_HIGH',
  'PRESSURE_LOW',
  'TEMPERATURE',
  'DECOMPRESSION',
  'COOLANT_HIGH',
  'REACTOR_TRIP',
  'LOAD_SHED',
] as const satisfies readonly AlarmCode[];

const REFUSAL_CODES = [
  'MERIDIAN_POWER_BUDGET',
  'MERIDIAN_BAD_COMMAND',
  'MERIDIAN_UNKNOWN_COMPARTMENT',
  'MERIDIAN_INTERLOCK',
  'MERIDIAN_FTL_NOT_SPOOLED',
  'MERIDIAN_RELAY',
  'MERIDIAN_UNCHARTED',
] as const satisfies readonly RefusalCode[];

/** `Listed` when it names every member of `Union`, `never` when one is missing. */
type Exhaustive<Union, Listed extends readonly Union[]> = [
  Exclude<Union, Listed[number]>,
] extends [never]
  ? Listed
  : never;

/**
 * The codes an `alarm` and a `refused` condition may name. A code added to
 * `AlarmCode` or `RefusalCode` and missing here fails the type check.
 */
export const MAP_CODES: {
  readonly alarm: Exhaustive<AlarmCode, typeof ALARM_CODES>;
  readonly refused: Exhaustive<RefusalCode, typeof REFUSAL_CODES>;
} = { alarm: ALARM_CODES, refused: REFUSAL_CODES };
