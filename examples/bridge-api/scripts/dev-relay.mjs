#!/usr/bin/env node
/**
 * A local subspace relay for development, the one the e2e suites use: it
 * serves /charts, /handshake and /signoff.
 *
 *   node --import tsx scripts/dev-relay.mjs
 *       listens on RELAY_PORT, or 3100, until it is stopped.
 *   node --import tsx scripts/dev-relay.mjs -- <command> [args]
 *       listens on a free port, runs the command with RELAY_URL set to the
 *       relay's address, stops the relay and exits with the command's code.
 *
 * The dev target runs the first form beside the server, and the profile
 * target runs the second around `nexusdi profile`.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { constants as osConstants } from 'node:os';

import { createRelay } from '../e2e/relay.ts';

const split = process.argv.indexOf('--');
const command = split === -1 ? [] : process.argv.slice(split + 1);
const port = command.length > 0 ? 0 : Number(process.env.RELAY_PORT ?? 3100);

const relay = createRelay();
const server = createServer(relay.handle).listen(port, '127.0.0.1');
await once(server, 'listening');
const { port: bound } = server.address();
const url = `http://127.0.0.1:${bound}`;

async function stop() {
  server.closeAllConnections();
  server.close();
  await once(server, 'close');
}

if (command.length === 0) {
  console.log(`dev-relay listening on ${url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => stop().then(() => process.exit(0)));
  }
} else {
  const [file, ...args] = command;
  const child = spawn(file, args, {
    stdio: 'inherit',
    env: { ...process.env, RELAY_URL: url },
  });
  const forward = (signal) => child.kill(signal);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => forward(signal));
  }
  const [outcome, detail] = await new Promise((resolve) => {
    child.once('error', (error) => resolve(['error', error]));
    child.once('exit', (code, signal) => resolve(['exit', { code, signal }]));
  });
  await stop();
  if (outcome === 'error') {
    console.error(`dev-relay: cannot run ${file}: ${detail.message}`);
    process.exit(127);
  }
  const { code, signal } = detail;
  process.exit(code ?? 128 + (osConstants.signals[signal] ?? 0));
}
