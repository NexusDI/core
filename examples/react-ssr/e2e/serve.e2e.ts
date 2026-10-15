import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
// The package exports only its package.json, so the bin is found beside it.
const serveBin = join(
  dirname(require.resolve('@react-router/serve/package.json')),
  'bin.cjs',
);
const dir = fileURLToPath(new URL('..', import.meta.url));
let child: ChildProcess | undefined;

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
    cwd: dir,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
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

afterEach(async () => {
  child?.kill('SIGTERM');
  if (child && child.exitCode === null) await once(child, 'exit');
  child = undefined;
});

describe('the built app', () => {
  it('serves the lazy sectors route as the first request on a fresh server', async () => {
    const url = await serve();
    const res = await fetch(`${url}/sectors/Kepler-442b`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Kepler-442b: heading 42');
  });

  it('renders the home page with the request mission and its own flight log', async () => {
    const url = await serve();
    const [a, b] = await Promise.all([
      fetch(url, { headers: { 'x-mission-id': 'survey-1' } }).then((r) =>
        r.text(),
      ),
      fetch(url, { headers: { 'x-mission-id': 'survey-2' } }).then((r) =>
        r.text(),
      ),
    ]);
    expect(a).toContain('survey-1: docked');
    expect(a).not.toContain('survey-2');
    expect(b).toContain('survey-2: docked');
  });

  it('ships no server container module to the client build', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const assets = new URL('../build/client/assets/', import.meta.url);
    for (const file of await readdir(assets)) {
      if (!file.endsWith('.js')) continue;
      const text = await readFile(new URL(file, assets), 'utf8');
      expect(text, file).not.toContain('relay.meridian.invalid');
      expect(text, file).not.toContain('x-mission-id');
    }
  });
});
