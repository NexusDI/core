import { registerRemotes } from '@module-federation/runtime';

import { STATIONS, type StationRow } from './stations';

/** The federation container names of the stations. */
export type StationName = StationRow['remote'];

/** Whether each station's remote entry was registered. */
export type Stations = Record<StationName, 'registered' | 'failed'>;

/** One entry of /remotes.json: a container name and its remoteEntry.js URL. */
interface RemoteEntry {
  readonly name: string;
  readonly entry: string;
}

const isEntryList = (value: unknown): value is RemoteEntry[] =>
  Array.isArray(value) &&
  value.every(
    (item) => typeof item?.name === 'string' && typeof item?.entry === 'string',
  );

const statusOf = (state: (name: StationName) => 'registered' | 'failed') =>
  Object.fromEntries(
    STATIONS.map(({ remote }) => [remote, state(remote)]),
  ) as Stations;

async function readRemotes(): Promise<RemoteEntry[] | undefined> {
  try {
    const response = await fetch('/remotes.json');
    if (!response.ok) return undefined;
    const list: unknown = await response.json();
    return isEntryList(list) ? list : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads the remote list the server answers at /remotes.json and registers
 * it with the federation runtime, before any loadRemote() runs. The list
 * comes from the server, so one shell build loads whichever remotes it
 * names. A list that cannot be read marks every station failed.
 */
export async function startRemotes(): Promise<Stations> {
  const list = await readRemotes();
  if (list === undefined) return statusOf(() => 'failed');
  // `type` is omitted so the federation runtime detects the entry format.
  // The rspack providers emit a script entry, and `type: 'module'` breaks
  // them with #RUNTIME-002.
  registerRemotes(list.map(({ name, entry }) => ({ name, entry })));
  const named = new Set(list.map(({ name }) => name));
  return statusOf((name) => (named.has(name) ? 'registered' : 'failed'));
}

/** The startup the sections wait on. It runs once, when this module loads. */
export const stations: Promise<Stations> = startRemotes();
