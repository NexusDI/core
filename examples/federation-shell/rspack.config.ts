import { meridianShell } from '@nexusdi/federation-contracts/rspack';

import { remoteEntry, STATIONS } from './src/stations';

export default meridianShell({
  name: 'federation_shell',
  port: 4300,
  // The development remote list, one entry per row of the station table.
  files: {
    'remotes.json': JSON.stringify(
      STATIONS.map((station) => remoteEntry(station, 'localhost')),
      null,
      2,
    ),
  },
});
