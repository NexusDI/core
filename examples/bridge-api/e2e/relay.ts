import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { BUNDLED_CHARTS } from '@nexusdi/meridian-systems';

/** A local subspace relay: serves GET /charts with the bundled table and counts the downloads. */
export async function startRelay(): Promise<{
  url: string;
  downloads(): number;
  close(): Promise<void>;
}> {
  let downloads = 0;
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/charts')) {
      downloads += 1;
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify(BUNDLED_CHARTS));
      return;
    }
    res.writeHead(404).end();
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    downloads: () => downloads,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}
