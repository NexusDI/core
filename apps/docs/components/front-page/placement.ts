import type {
  ConduitId,
  HatchId,
  SystemId,
} from '@nexusdi/meridian/scenes/front-page';

/**
 * Where the front page's program sits on the ship (site-ux 4.3, 5.1 and
 * ship-systems 16.3). Every id is an id of
 * `examples/meridian-systems/deck/meridian.geometry.json`, and `placement.test.ts`
 * checks each one against that file and against `inspect()` of the seed root.
 * Providers, hatches and conduits are named by the description of their token
 * or by "importer>imported", as the scene's state names them.
 */

export type ModuleName =
  'Engineering' | 'Comms' | 'Tactical' | 'BridgeApi' | 'Meridian';

/** A conduit between two rooms: the exported provider's room, the importer's room, and the rooms the line crosses. */
export interface Route {
  readonly from: string;
  readonly to: string;
  /** Room ids from `from` to `to`; each neighbouring pair shares a door. */
  readonly rooms: readonly string[];
}

export interface Placement {
  /** The rooms of each hull section's module, the module's anchor first. */
  readonly hullSections: Readonly<Record<ModuleName, readonly string[]>>;
  /** The fixture each provider sits on. */
  readonly providers: Readonly<Record<SystemId, string>>;
  /** The fixture the bridge readout sits on. */
  readonly readout: string;
  /** The door each export is the hatch of. */
  readonly hatches: Readonly<Record<HatchId, string>>;
  /** The route each module import draws. */
  readonly conduits: Readonly<Record<ConduitId, Route>>;
  /** Providers the graph holds that the ship draws nowhere, with the reason. */
  readonly unplaced: Readonly<Record<string, string>>;
}

export const PLACEMENT: Placement = {
  hullSections: {
    Engineering: ['engineering', 'reactor-bay', 'computer-core'],
    Comms: ['comms-relay'],
    Tactical: ['chart-room', 'drone-bay'],
    BridgeApi: ['shuttle-bay'],
    Meridian: ['bridge'],
  },
  providers: {
    ReactorCore: 'reactor-bay.vessel',
    ShipComputer: 'computer-core.rack-forward',
    SubspaceLink: 'comms-relay.equipment-rack',
    NavCharts: 'chart-room.plot-table',
    SurveyDrone: 'drone-bay.drone',
    FlightLog: 'shuttle-bay.shuttle',
    DiagnosticsPanel: 'bridge.station-bank',
  },
  readout: 'bridge.forward-console',
  hatches: {
    ShipComputer: 'bridge-computer-core',
    SubspaceLink: 'habitat-comms-relay',
    NavCharts: 'bridge-chart-room',
    SurveyDrone: 'shuttle-bay-drone-bay',
    FlightLog: 'airlock-shuttle-bay',
  },
  conduits: {
    'Tactical>Engineering': {
      from: 'computer-core',
      to: 'chart-room',
      rooms: ['computer-core', 'bridge', 'chart-room'],
    },
    'Tactical>Comms': {
      from: 'comms-relay',
      to: 'chart-room',
      rooms: ['comms-relay', 'habitat', 'bridge', 'chart-room'],
    },
    'Meridian>Engineering': {
      from: 'computer-core',
      to: 'bridge',
      rooms: ['computer-core', 'bridge'],
    },
    'Meridian>Comms': {
      from: 'comms-relay',
      to: 'bridge',
      rooms: ['comms-relay', 'habitat', 'bridge'],
    },
    'Meridian>Tactical': {
      from: 'chart-room',
      to: 'bridge',
      rooms: ['chart-room', 'bridge'],
    },
    'Meridian>BridgeApi': {
      from: 'shuttle-bay',
      to: 'bridge',
      rooms: ['shuttle-bay', 'airlock', 'habitat', 'bridge'],
    },
  },
  unplaced: {
    CommsOptions:
      'The options value of Comms.forRoot(); it lights no room (site-ux 4.4).',
  },
};
