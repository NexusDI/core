import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';

import {
  DECK_PLAN,
  RNG,
  SHIP_STATE,
  SIM_CLOCK,
  TELEMETRY,
  TICK_LOOP,
} from '@nexusdi/meridian-systems';

import { expect, test } from './support';

const require = createRequire(import.meta.url);
// The package exports only its package.json, so the bin is found beside it.
const serveBin = join(
  dirname(require.resolve('@react-router/serve/package.json')),
  'bin.cjs',
);
const app = join(import.meta.dirname, '..');
let child: ChildProcess | undefined;

/**
 * The descriptions of the simulation's tokens. A minifier keeps a token's
 * description as a string literal and renames function names, so these
 * strings show the library in a bundle (ship systems spec section 9).
 */
const SIMULATION = [
  TICK_LOOP,
  SHIP_STATE,
  SIM_CLOCK,
  RNG,
  DECK_PLAN,
  TELEMETRY,
].map(String);

/** The client build's scripts: what the browser downloads. */
async function clientScripts(): Promise<string[]> {
  const assets = join(app, 'build/client/assets');
  const scripts = (await readdir(assets)).filter((f) => f.endsWith('.js'));
  return scripts.map((file) => join(assets, file));
}

async function freePort(): Promise<number> {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('no TCP address');
  server.close();
  await once(server, 'close');
  return address.port;
}

/** A fresh react-router-serve process on the built app: no module loaded yet. */
async function serve(): Promise<string> {
  const port = await freePort();
  child = spawn(process.execPath, [serveBin, './build/server/index.js'], {
    cwd: app,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      BRIDGE_API_URL: 'http://127.0.0.1:4211/',
    },
    stdio: 'pipe',
  });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      await fetch(url, { method: 'HEAD' });
      return url;
    } catch {
      if (Date.now() > deadline)
        throw new Error('react-router-serve did not answer in 30 s');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

test.afterEach(async () => {
  child?.kill('SIGTERM');
  if (child && child.exitCode === null) await once(child, 'exit');
  child = undefined;
});

test('serves the lazy sectors route as the first request on a fresh server', async () => {
  const url = await serve();
  const res = await fetch(`${url}/sectors/Kepler-442b`);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('Kepler-442b: heading 42');
});

test('keeps every server container module out of the client build', async () => {
  const scripts = await clientScripts();
  expect(scripts.length).toBeGreaterThan(0);
  for (const file of scripts) {
    const text = await readFile(file, 'utf8');
    expect(text, file).not.toContain('x-mission-id');
    expect(text, file).not.toContain('BRIDGE_API_URL');
    // A module's name stays a string in the minified build, and
    // BridgeConsole is the server root.
    expect(text, file).not.toContain('BridgeConsole');
  }
});

test('keeps the simulation out of the client build', async () => {
  const scripts = await clientScripts();
  expect(scripts.length).toBeGreaterThan(0);
  for (const file of scripts) {
    const text = await readFile(file, 'utf8');
    for (const sentinel of SIMULATION)
      expect(text, `${sentinel} in ${file}`).not.toContain(sentinel);
  }
});
