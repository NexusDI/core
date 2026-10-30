import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { BUNDLED_CHARTS } from '@nexusdi/meridian-systems/charts';

/**
 * A local subspace relay: serves GET /charts with the bundled table and counts
 * the downloads, accepts POST /handshake at startup, and keeps each POST
 * /signoff body.
 */
export async function startRelay(): Promise<{
  url: string;
  downloads(): number;
  handshakes(): number;
  signOffs(): unknown[];
  close(): Promise<void>;
}> {
  let downloads = 0;
  let handshakes = 0;
  const signOffs: unknown[] = [];
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/charts')) {
      downloads += 1;
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify(BUNDLED_CHARTS));
      return;
    }
    if (req.method === 'POST' && req.url?.startsWith('/handshake')) {
      handshakes += 1;
      res.writeHead(204).end();
      return;
    }
    if (req.method === 'POST' && req.url?.startsWith('/signoff')) {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        signOffs.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        res.writeHead(204).end();
      });
      return;
    }
    res.writeHead(404).end();
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    downloads: () => downloads,
    handshakes: () => handshakes,
    signOffs: () => signOffs,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}
