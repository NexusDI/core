import { remoteEntry, stationById } from '../src/stations.ts';
import { OFFSET } from './ports.ts';

const HOST = '127.0.0.1';

const row = stationById;

/**
 * The remote lists a shell instance can load, by the name serve.ts takes in
 * REMOTES. Each entry names a row of the station table and the port its
 * build is served on.
 */
export const REMOTE_LISTS = {
  main: [
    remoteEntry(row('cartography'), HOST),
    remoteEntry(row('command'), HOST),
  ],
  drift: [
    remoteEntry(row('cartography'), HOST, OFFSET.drift),
    remoteEntry(row('command'), HOST),
  ],
  unshared: [
    remoteEntry(row('cartography'), HOST, OFFSET.unshared),
    remoteEntry(row('command'), HOST),
  ],
  growth: [
    remoteEntry(row('command'), HOST, OFFSET.growth),
    remoteEntry(row('engineering'), HOST, OFFSET.growth),
    remoteEntry(row('life-support'), HOST, OFFSET.growth),
  ],
} as const;

export type RemoteListName = keyof typeof REMOTE_LISTS;
