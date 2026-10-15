import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const require = createRequire(import.meta.url);

/** A free TCP port: next start has no port 0, so the test asks the OS for one. */
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

const answers = (url: string) =>
  fetch(url).then(
    () => true,
    () => false,
  );

/**
 * Runs `next start` on the build in `dir` and resolves once it answers.
 * close() stops the process and resolves once the port refuses connections.
 */
export async function startNext(
  dir: string,
): Promise<{ url: string; close(): Promise<void> }> {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [
      require.resolve('next/dist/bin/next'),
      'start',
      '-p',
      String(port),
      '-H',
      '127.0.0.1',
    ],
    {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Vitest sets NODE_ENV=test, and next start needs production.
      env: { ...process.env, NODE_ENV: 'production' },
    },
  );
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (!(await answers(`${url}/api/gate`))) {
    if (child.exitCode !== null)
      throw new Error(`next start exited ${child.exitCode}:\n${output}`);
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`next start did not answer in 60 s:\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return {
    url,
    async close() {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
        await exited;
        clearTimeout(timer);
      }
      while (await answers(url))
        await new Promise((resolve) => setTimeout(resolve, 50));
    },
  };
}
