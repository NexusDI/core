import type { DoorState, FixtureState, RoomState } from '@nexusdi/meridian-ui';
import type {
  ConduitId,
  HatchId,
  SystemId,
} from '@nexusdi/meridian/scenes/front-page';

import { PLACEMENT } from '../placement';
import {
  ALL_ROOMS,
  CONDUIT_IDS,
  HATCH_IDS,
  SYSTEM_IDS,
  partById,
  type Point,
} from './geometry';
import {
  entriesOf,
  fieldString,
  missingFields,
  type CheckResult,
  type DescribedError,
} from './outcome';
import {
  LIFETIME,
  poweredRooms,
  roomOfSystem,
  type Power,
  type SystemStatus,
} from './power';
import type { BayState } from './state';

/**
 * The ship as the page draws it. `lightTable` is the one derived table of
 * room, fixture and door state. The tint layer of the painted `Schematic`
 * reads it today, and a light layer can read the same table (owner ruling
 * OR5). Everything else here is the overlay's: glyph status, conduit and hatch
 * state, empty sockets, callouts and the banner. Each comes from what core
 * returned (5.2, 5.3), and none from a table of messages.
 */

export interface LightTable {
  readonly rooms: Readonly<Record<string, RoomState>>;
  readonly fixtures: Readonly<Record<string, FixtureState>>;
  readonly doors: Readonly<Record<string, DoorState>>;
}

export type ConduitStatus = 'intact' | 'cut' | 'broken';
export type HatchStatus = 'open' | 'closed' | 'alarm';

export interface Socket {
  readonly token: string;
  readonly at: Point;
}

export interface Callout {
  readonly id: string;
  readonly at: Point;
  readonly title: string;
  readonly readouts: readonly { label: string; value: string }[];
  readonly tone: 'info' | 'alarm';
}

export interface Note {
  readonly id: string;
  readonly at: Point;
  readonly text: string;
}

/** An edit the alarm banner's "Apply the fix" makes (5.10). */
export type Fix =
  | { readonly kind: 'import'; readonly conduit: ConduitId }
  | { readonly kind: 'export'; readonly hatch: HatchId };

export interface Banner {
  readonly code: string;
  readonly subject: string;
  readonly line: string;
  /** The number of entries; the banner prints "N errors" above one. */
  readonly count: number;
  readonly fixes: readonly Fix[];
}

export interface ShipView {
  readonly light: LightTable;
  readonly systems: Readonly<Record<SystemId, SystemStatus>>;
  readonly conduits: Readonly<Record<ConduitId, ConduitStatus>>;
  readonly hatches: Readonly<Record<HatchId, HatchStatus>>;
  readonly chartServer: 'reachable' | 'unreachable' | 'failed';
  readonly sockets: readonly Socket[];
  readonly callouts: readonly Callout[];
  readonly notes: readonly Note[];
  readonly banner: Banner | null;
}

export interface ShipInput {
  readonly state: BayState;
  readonly power: Power;
  /** The last check; null before the first one has run. */
  readonly check: CheckResult | null;
  /** The error `Nexus.create` rejected with. */
  readonly startupError: DescribedError | null;
  /** The error of the bridge readout's lookup. */
  readonly lookupError: DescribedError | null;
  /** Systems that came online in the step on screen. */
  readonly online: readonly SystemId[];
  /** The conduit the reader restored last, while its check passes. */
  readonly linked: ConduitId | null;
}

const isSystem = (token: string | null): token is SystemId =>
  token !== null && (SYSTEM_IDS as readonly string[]).includes(token);
const isHatch = (token: string | null): token is HatchId =>
  token !== null && (HATCH_IDS as readonly string[]).includes(token);
const isConduit = (id: string): id is ConduitId =>
  (CONDUIT_IDS as readonly string[]).includes(id);

function anchorOf(id: string): Point {
  return partById(id)?.at ?? [0, 0];
}

const FIXTURE_OF_STATUS: Readonly<Record<SystemStatus, FixtureState>> = {
  idle: 'unpowered',
  active: 'unpowered',
  nominal: 'powered',
  standby: 'unpowered',
  alarm: 'alarm',
  offline: 'offline',
};

/** The sentence under a banner's code, from the fields of one entry. */
function lineOf(entry: DescribedError): string {
  const mp = missingFields(entry);
  if (mp !== null) {
    return mp.requester === null
      ? `${mp.module} (module) cannot reach ${mp.token}.`
      : `${mp.requester} (provider) in ${mp.module} (module) cannot reach ${mp.token}.`;
  }
  const token = fieldString(entry, 'token');
  const moduleName = fieldString(entry, 'module');
  if (entry.kind === 'invalid-export' && token && moduleName)
    return `${moduleName} (module) exports ${token}, which it cannot see.`;
  return 'See the terminal.';
}

/** The edit an entry's near misses name, or none (5.10). */
function fixesOf(entry: DescribedError): Fix[] {
  const mp = missingFields(entry);
  if (mp === null) return [];
  const out: Fix[] = [];
  for (const near of mp.nearMisses) {
    if (near.kind === 'not-imported') {
      const id = `${mp.module}>${near.module}`;
      if (isConduit(id)) out.push({ kind: 'import', conduit: id });
    } else if (near.kind === 'not-exported' && isHatch(mp.token)) {
      out.push({ kind: 'export', hatch: mp.token });
    }
  }
  return out;
}

/** The banner for a failed check: the first entry's code and module, and the count. */
export function bannerOfCheck(error: DescribedError): Banner {
  const entries = entriesOf(error);
  const first = entries[0] ?? error;
  return {
    code: first.code ?? error.code ?? 'UNKNOWN',
    subject: fieldString(first, 'module') ?? 'Meridian',
    line: `${lineOf(first)} Launch is locked.`,
    count: entries.length,
    fixes: entries.flatMap(fixesOf),
  };
}

export function shipView(input: ShipInput): ShipView {
  const { state, power, check, startupError, lookupError } = input;
  const entries =
    check !== null && !check.ok && check.error ? entriesOf(check.error) : [];

  const alarmRooms = new Set<string>();
  const sockets: Socket[] = [];
  const brokenToken = new Map<ConduitId, string>();
  const alarmHatches = new Set<HatchId>();

  for (const entry of entries) {
    const mp = missingFields(entry);
    if (mp !== null) {
      if (isSystem(mp.requester)) {
        alarmRooms.add(roomOfSystem(mp.requester));
        sockets.push({
          token: mp.token,
          at: anchorOf(`system-${mp.requester}`),
        });
      }
      for (const fix of fixesOf(entry)) {
        if (fix.kind === 'import') brokenToken.set(fix.conduit, mp.token);
        else alarmHatches.add(fix.hatch);
      }
    } else if (entry.kind === 'invalid-export') {
      const token = fieldString(entry, 'token');
      if (isHatch(token)) alarmHatches.add(token);
      if (isSystem(token)) alarmRooms.add(roomOfSystem(token));
    }
  }
  if (startupError?.kind === 'provider-failed') {
    const token = fieldString(startupError, 'token');
    if (isSystem(token)) alarmRooms.add(roomOfSystem(token));
  }
  if (lookupError?.kind === 'not-visible') alarmRooms.add('bridge');

  const lit = poweredRooms(state, power);
  const rooms: Record<string, RoomState> = {};
  for (const room of ALL_ROOMS)
    rooms[room] = alarmRooms.has(room)
      ? 'alarm'
      : lit.has(room)
        ? 'powered'
        : 'unpowered';

  const fixtures: Record<string, FixtureState> = {};
  const systems = {} as Record<SystemId, SystemStatus>;
  for (const id of SYSTEM_IDS) {
    const status: SystemStatus = state.systems[id]
      ? power.systems[id] === 'offline'
        ? LIFETIME[id] === 'singleton'
          ? 'idle'
          : 'standby'
        : power.systems[id]
      : 'offline';
    systems[id] = status;
    fixtures[PLACEMENT.providers[id]] = FIXTURE_OF_STATUS[status];
  }
  fixtures[PLACEMENT.readout] =
    rooms['bridge'] === 'powered' ? 'powered' : 'unpowered';

  const doors: Record<string, DoorState> = {};
  const hatches = {} as Record<HatchId, HatchStatus>;
  for (const id of HATCH_IDS) {
    hatches[id] = !state.hatches[id]
      ? 'closed'
      : alarmHatches.has(id)
        ? 'alarm'
        : 'open';
    if (!state.hatches[id]) doors[PLACEMENT.hatches[id]] = 'closed';
  }

  const conduits = {} as Record<ConduitId, ConduitStatus>;
  for (const id of CONDUIT_IDS)
    conduits[id] = state.conduits[id]
      ? 'intact'
      : brokenToken.has(id)
        ? 'broken'
        : 'cut';

  const callouts: Callout[] = [];
  for (const [id, token] of brokenToken) {
    const [importer, imported] = id.split('>') as [string, string];
    callouts.push({
      id: `lost-${id}`,
      at: anchorOf(`conduit-${importer}-${imported}`),
      title: 'Link lost',
      readouts: [
        { label: 'Conduit', value: `${importer} to ${imported}` },
        { label: 'Missing', value: token },
      ],
      tone: 'alarm',
    });
  }
  if (input.linked !== null && check?.ok) {
    const [importer, imported] = input.linked.split('>') as [string, string];
    callouts.push({
      id: `linked-${input.linked}`,
      at: anchorOf(`conduit-${importer}-${imported}`),
      title: 'Linked',
      readouts: [{ label: 'Conduit', value: `${importer} to ${imported}` }],
      tone: 'info',
    });
  }
  for (const id of SYSTEM_IDS) {
    if (systems[id] === 'active' && id === 'NavCharts')
      callouts.push({
        id: `active-${id}`,
        at: anchorOf(`system-${id}`),
        title: 'Downloading charts',
        readouts: [{ label: 'System', value: id }],
        tone: 'info',
      });
  }
  for (const id of input.online)
    if (systems[id] === 'nominal')
      callouts.push({
        id: `online-${id}`,
        at: anchorOf(`system-${id}`),
        title: 'Online',
        readouts: [{ label: 'System', value: id }],
        tone: 'info',
      });

  const notes: Note[] = [];
  for (const id of SYSTEM_IDS) {
    if (!state.systems[id])
      notes.push({
        id: `removed-${id}`,
        at: anchorOf(`system-${id}`),
        text: `Removed from ${partById(`system-${id}`)?.module ?? 'the ship'}`,
      });
  }
  for (const id of HATCH_IDS) {
    if (!state.hatches[id])
      notes.push({
        id: `closed-${id}`,
        at: anchorOf(`hatch-${id}`),
        text: `Hatch closed: ${partById(`hatch-${id}`)?.module ?? ''} keeps ${id} private`,
      });
  }
  if (!state.chartServerReachable)
    notes.push({
      id: 'chart-server',
      at: anchorOf('chart-server'),
      text: 'The check runs no factories',
    });
  if (systems.FlightLog === 'standby')
    notes.push({
      id: 'standby-FlightLog',
      at: anchorOf('system-FlightLog'),
      text: 'Builds per request',
    });

  let banner: Banner | null = null;
  if (check !== null && !check.ok && check.error) {
    banner = bannerOfCheck(check.error);
  } else if (lookupError !== null) {
    const token = fieldString(lookupError, 'token') ?? 'the system';
    const owners = lookupError.fields['owners'];
    const owner = Array.isArray(owners) ? String(owners[0]) : 'its module';
    banner = {
      code: lookupError.code ?? 'UNKNOWN',
      subject: 'Meridian',
      line: `The bridge asked for ${token}, which ${owner} keeps private.`,
      count: 1,
      fixes: [],
    };
  } else if (startupError !== null) {
    const token = fieldString(startupError, 'token') ?? 'A provider';
    banner = {
      code: startupError.code ?? 'UNKNOWN',
      subject: fieldString(startupError, 'module') ?? 'Meridian',
      line: `${token} (provider) failed at startup${startupError.cause ? `: ${startupError.cause.message}` : ''}.`,
      count: 1,
      fixes: [],
    };
  }

  return {
    light: { rooms, fixtures, doors },
    systems,
    conduits,
    hatches,
    chartServer: !state.chartServerReachable
      ? startupError !== null
        ? 'failed'
        : 'unreachable'
      : 'reachable',
    sockets,
    callouts,
    notes,
    banner,
  };
}
