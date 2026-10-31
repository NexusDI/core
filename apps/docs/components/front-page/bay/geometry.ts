import type {
  ConduitId,
  HatchId,
  SystemId,
} from '@nexusdi/meridian/scenes/front-page';

/**
 * Where each part of the ship a reader can click sits on the painted
 * cutaway (site UX spec 4.3, owner ruling OR3), in the cutaway's metre
 * coordinates: x along the hull, y down, the frame `-5 -1.5 80 20`. The
 * coordinates come from the tuned mock of the bay, whose 44 px spacing on a
 * phone `geometry.test.ts` checks again. This file holds data and pure
 * helpers only, and imports nothing from core, so the bay controller chunk
 * stays small.
 */

export type Point = readonly [x: number, y: number];

export type SectionId =
  'meridian' | 'engineering' | 'tactical' | 'comms' | 'bridgeapi';

export type PartKind = 'conduit' | 'system' | 'hatch' | 'chart-server';

/** The module of each hull section, as the ship names it. */
export const SECTIONS: readonly {
  readonly id: SectionId;
  readonly module: string;
  readonly tab: string;
}[] = [
  { id: 'meridian', module: 'Meridian', tab: 'Meridian' },
  { id: 'engineering', module: 'Engineering', tab: 'Engineering' },
  { id: 'tactical', module: 'Tactical', tab: 'Tactical' },
  { id: 'comms', module: 'Comms', tab: 'Comms' },
  { id: 'bridgeapi', module: 'BridgeApi', tab: 'BridgeApi' },
];

/** The ids the scene's state names, in the scene's order. */
export const CONDUIT_IDS = [
  'Tactical>Engineering',
  'Tactical>Comms',
  'Meridian>Engineering',
  'Meridian>Comms',
  'Meridian>Tactical',
  'Meridian>BridgeApi',
] as const satisfies readonly ConduitId[];
export const SYSTEM_IDS = [
  'ReactorCore',
  'ShipComputer',
  'SubspaceLink',
  'NavCharts',
  'SurveyDrone',
  'FlightLog',
  'DiagnosticsPanel',
] as const satisfies readonly SystemId[];
export const HATCH_IDS = [
  'ShipComputer',
  'SubspaceLink',
  'NavCharts',
  'SurveyDrone',
  'FlightLog',
] as const satisfies readonly HatchId[];

/** Every room of the cutaway, as the committed schematic names them. */
export const ALL_ROOMS = [
  'airlock',
  'bridge',
  'capacitor-room',
  'chart-room',
  'comms-relay',
  'computer-core',
  'drone-bay',
  'engineering',
  'ftl-core',
  'habitat',
  'main-drive',
  'quarters',
  'reactor-bay',
  'shuttle-bay',
] as const;

export function isSystemId(token: string): token is SystemId {
  return (SYSTEM_IDS as readonly string[]).includes(token);
}

export interface Part {
  /** A DOM-safe id: `conduit-Tactical-Comms`, `system-NavCharts`, `hatch-NavCharts`, `chart-server`. */
  readonly id: string;
  readonly kind: PartKind;
  /** The scene key: a conduit id, a system id, a hatch id, or `chartServer`. */
  readonly key: string;
  readonly section: SectionId;
  /** The hit point: a glyph's centre, or a conduit's handle. */
  readonly at: Point;
  /** A conduit's route, from the importing module's room to the exporting one. The arrow ends the route. */
  readonly path?: readonly Point[];
  /** The ship word: "Conduit", "System", "Hatch" or "Chart server link". */
  readonly ship: string;
  /** The code name: "Tactical imports Comms", "NavCharts (provider)". */
  readonly code: string;
  /** The module the part belongs to, for the group name in lists. */
  readonly module: string;
}

const SYSTEM_MODULE: Readonly<Record<SystemId, string>> = {
  ReactorCore: 'Engineering',
  ShipComputer: 'Engineering',
  SubspaceLink: 'Comms',
  NavCharts: 'Tactical',
  SurveyDrone: 'Tactical',
  FlightLog: 'BridgeApi',
  DiagnosticsPanel: 'Meridian',
};

const HATCH_MODULE: Readonly<Record<HatchId, string>> = {
  ShipComputer: 'Engineering',
  SubspaceLink: 'Comms',
  NavCharts: 'Tactical',
  SurveyDrone: 'Tactical',
  FlightLog: 'BridgeApi',
};

/** The ship's name for each system, which the placard pairs with the code name. */
export const SYSTEM_WORD: Readonly<Record<SystemId, string>> = {
  ReactorCore: 'reactor',
  ShipComputer: 'ship computer',
  SubspaceLink: 'subspace link',
  NavCharts: 'nav charts',
  SurveyDrone: 'survey drone',
  FlightLog: 'flight log',
  DiagnosticsPanel: 'diagnostics panel',
};

const conduit = (
  key: ConduitId,
  section: SectionId,
  path: readonly Point[],
  at: Point,
): Part => {
  const [importer, imported] = key.split('>') as [string, string];
  return {
    id: `conduit-${importer}-${imported}`,
    kind: 'conduit',
    key,
    section,
    at,
    path,
    ship: 'Conduit',
    code: `${importer} imports ${imported}`,
    module: importer,
  };
};

const system = (
  key: SystemId,
  section: SectionId,
  at: Point,
  ship = 'System',
): Part => ({
  id: `system-${key}`,
  kind: 'system',
  key,
  section,
  at,
  ship,
  code: `${key} (provider)`,
  module: SYSTEM_MODULE[key],
});

const hatch = (key: HatchId, section: SectionId, at: Point): Part => ({
  id: `hatch-${key}`,
  kind: 'hatch',
  key,
  section,
  at,
  ship: 'Hatch',
  code: `${HATCH_MODULE[key]} exports ${key}`,
  module: HATCH_MODULE[key],
});

const PARTS: readonly Part[] = [
  conduit(
    'Meridian>Engineering',
    'meridian',
    [
      [4.0, 10.4],
      [4.0, 12.1],
    ],
    [4.0, 11.2],
  ),
  system('ShipComputer', 'engineering', [8.47, 11.67]),
  system('DiagnosticsPanel', 'meridian', [6.2, 10.4]),
  conduit(
    'Meridian>Tactical',
    'meridian',
    [
      [8.4, 9.0],
      [10.15, 9.0],
    ],
    [8.85, 9.0],
  ),
  conduit(
    'Meridian>Comms',
    'meridian',
    [
      [7.0, 8.9],
      [7.0, 5.9],
      [11.88, 5.9],
    ],
    [7.0, 7.4],
  ),
  conduit(
    'Tactical>Comms',
    'tactical',
    [
      [10.6, 8.05],
      [10.6, 5.6],
      [11.95, 5.6],
    ],
    [10.6, 6.8],
  ),
  system('NavCharts', 'tactical', [10.75, 9.0]),
  hatch('SubspaceLink', 'comms', [12.05, 5.6]),
  hatch('NavCharts', 'tactical', [13.6, 8.05]),
  {
    id: 'chart-server',
    kind: 'chart-server',
    key: 'chartServer',
    section: 'tactical',
    at: [12.6, 10.7],
    ship: 'Chart server link',
    code: 'chart room',
    module: 'Tactical',
  },
  system('SubspaceLink', 'comms', [15.42, 5.37]),
  conduit(
    'Meridian>BridgeApi',
    'meridian',
    [
      [9.4, 10.6],
      [9.4, 11.95],
      [15.9, 11.95],
    ],
    [14.2, 11.95],
  ),
  system('FlightLog', 'bridgeapi', [16.0, 13.0]),
  hatch('FlightLog', 'bridgeapi', [19.8, 11.25]),
  system('ReactorCore', 'engineering', [28.7, 9.35]),
  system('SurveyDrone', 'tactical', [31.62, 11.82]),
  hatch('SurveyDrone', 'tactical', [34.6, 11.25]),
  conduit(
    'Tactical>Engineering',
    'tactical',
    [
      [36.6, 13.2],
      [36.6, 10.35],
    ],
    [36.6, 12.9],
  ),
  hatch('ShipComputer', 'engineering', [42.35, 8.05]),
];

/** Every clickable part, in hull order: bow to stern, then top to bottom. */
export const PARTS_IN_HULL_ORDER: readonly Part[] = [...PARTS].sort(
  (left, right) => left.at[0] - right.at[0] || left.at[1] - right.at[1],
);

export function partById(id: string): Part | undefined {
  return PARTS.find((part) => part.id === id);
}

/** The placard text of a part: the ship word with the code name. */
export function placardOf(part: Part): string {
  return part.kind === 'chart-server'
    ? 'Chart server link in the chart room'
    : `${part.ship}: ${part.code}`;
}

/** The hit diameter in CSS pixels: 24 with a fine pointer, 44 with a coarse one (WCAG 2.5.8). */
export const HIT_PX = { fine: 24, coarse: 44 } as const;

/** The whole cutaway's frame in metres: `x y width height`. */
export const FRAME: readonly [number, number, number, number] = [
  -5, -1.5, 80, 20,
];

/**
 * What one hull section shows on a phone (site UX spec 4.11, TL17): one crop
 * for each contiguous run of the ship that the section's parts sit in, side by
 * side at one scale, over the same range of y.
 */
export interface SectionCrop {
  readonly y: readonly [top: number, bottom: number];
  readonly runs: readonly (readonly [from: number, to: number])[];
  /** The placard under each run. */
  readonly names: readonly string[];
}

export const CROPS: Readonly<Record<SectionId, SectionCrop>> = {
  meridian: { y: [4.5, 13.5], runs: [[0.5, 17.0]], names: ['Bridge'] },
  engineering: {
    y: [3.3, 15.9],
    runs: [
      [1.5, 10.5],
      [26.5, 56.5],
    ],
    names: ['Computer core', 'Engineering, reactor bay'],
  },
  tactical: {
    y: [5.0, 17.1],
    runs: [
      [8.5, 15.5],
      [29.5, 39.5],
    ],
    names: ['Chart room', 'Drone bay'],
  },
  comms: { y: [3.5, 9.0], runs: [[9.5, 18.5]], names: ['Comms relay'] },
  bridgeapi: { y: [9.5, 17.5], runs: [[12.0, 26.0]], names: ['Shuttle bay'] },
};

/** The width in px of the gap that a break mark takes between two runs. */
export const BREAK_PX = 18;

/** The pixels per metre of each run of a section in `width` px. */
export function runScale(section: SectionId, width: number): number {
  const { runs } = CROPS[section];
  const metres = runs.reduce((sum, [from, to]) => sum + (to - from), 0);
  return (width - BREAK_PX * (runs.length - 1)) / metres;
}

/** The parts of a section that sit in one run. */
export function partsInRun(section: SectionId, run: number): readonly Part[] {
  const [from, to] = CROPS[section].runs[run] ?? [0, 0];
  return PARTS_IN_HULL_ORDER.filter(
    (part) =>
      part.section === section && part.at[0] >= from && part.at[0] <= to,
  );
}

/**
 * The route of a conduit with a gap cut around its handle: two polylines,
 * each ending `gap` metres short of the handle along the route.
 */
export function cutPath(
  path: readonly Point[],
  at: Point,
  gap = 0.4,
): readonly (readonly Point[])[] {
  const lengths: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Point;
    const b = path[i] as Point;
    lengths.push(
      (lengths[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]),
    );
  }
  const total = lengths[lengths.length - 1] as number;
  const handle = distanceAlong(path, lengths, at);
  const before = Math.max(0, handle - gap);
  const after = Math.min(total, handle + gap);
  return [
    subpath(path, lengths, 0, before),
    subpath(path, lengths, after, total),
  ];
}

function distanceAlong(
  path: readonly Point[],
  lengths: readonly number[],
  at: Point,
): number {
  let best = 0;
  let bestError = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Point;
    const b = path[i] as Point;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy) / len2),
          );
    const px = a[0] + t * dx;
    const py = a[1] + t * dy;
    const error = Math.hypot(at[0] - px, at[1] - py);
    if (error < bestError) {
      bestError = error;
      best = (lengths[i - 1] as number) + t * Math.sqrt(len2);
    }
  }
  return best;
}

function pointAt(
  path: readonly Point[],
  lengths: readonly number[],
  distance: number,
): Point {
  for (let i = 1; i < path.length; i++) {
    const start = lengths[i - 1] as number;
    const end = lengths[i] as number;
    if (distance <= end || i === path.length - 1) {
      const a = path[i - 1] as Point;
      const b = path[i] as Point;
      const t = end === start ? 0 : (distance - start) / (end - start);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return path[0] as Point;
}

function subpath(
  path: readonly Point[],
  lengths: readonly number[],
  from: number,
  to: number,
): readonly Point[] {
  const out: Point[] = [pointAt(path, lengths, from)];
  for (let i = 1; i < path.length - 1; i++) {
    const at = lengths[i] as number;
    if (at > from && at < to) out.push(path[i] as Point);
  }
  out.push(pointAt(path, lengths, to));
  return out;
}
