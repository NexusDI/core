/**
 * One station of the ship. The shell derives the remote list, the lazy
 * sections, the nav and the routes from these rows.
 */
export interface Station {
  /** The section id, such as `life-support`. */
  readonly id: string;
  /** The nav label and the name the loading text uses. */
  readonly label: string;
  /** The route the station answers on. */
  readonly path: string;
  /** The federation container name of the remote. */
  readonly remote: string;
  /** The remote's development server port. */
  readonly port: number;
  /** The export of `./section` that holds the station's module. */
  readonly module: string;
  /** The export of `./section` that holds the station's component. */
  readonly panel: string;
  /** What the panel is called in its loading text. */
  readonly panelName: string;
}

export const STATIONS = [
  {
    id: 'cartography',
    label: 'Cartography',
    path: '/charts',
    remote: 'federation_cartography',
    port: 4301,
    module: 'CartographyStation',
    panel: 'CartographyPanel',
    panelName: 'star map',
  },
  {
    id: 'command',
    label: 'Command',
    path: '/command',
    remote: 'federation_command',
    port: 4302,
    module: 'CommandStation',
    panel: 'CommandPanel',
    panelName: 'command deck',
  },
  {
    id: 'engineering',
    label: 'Engineering',
    path: '/engineering',
    remote: 'federation_engineering',
    port: 4305,
    module: 'EngineeringStation',
    panel: 'EngineeringPanel',
    panelName: 'engineering panel',
  },
  {
    id: 'life-support',
    label: 'Life support',
    path: '/life-support',
    remote: 'federation_life_support',
    port: 4306,
    module: 'LifeSupportStation',
    panel: 'LifeSupportPanel',
    panelName: 'life-support panel',
  },
] as const satisfies readonly Station[];

/** A row of STATIONS, with its literal id, path and remote name. */
export type StationRow = (typeof STATIONS)[number];

/** The station that answers on `path`, or undefined for any other route. */
export const stationAt = (path: string): StationRow | undefined =>
  STATIONS.find((station) => station.path === path);

/** The row with this id. */
export function stationById(id: StationRow['id']): StationRow {
  const row = STATIONS.find((station) => station.id === id);
  if (row === undefined) throw new Error(`No station ${id}.`);
  return row;
}

/**
 * The remote list entry of `station`: its container name and the URL of its
 * remoteEntry.js on `host`. `offset` moves the port, for a build served
 * beside the development remote.
 */
export const remoteEntry = (station: Station, host: string, offset = 0) => ({
  name: station.remote,
  entry: `http://${host}:${station.port + offset}/remoteEntry.js`,
});
