import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

const LISTENING = /Server is running on (http:\/\/localhost:(\d+))/;

/** Starts one entry under tsx, on a free port, the offline graph and a manual ship. */
function start(entry: string): ChildProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: '0',
    // An empty RELAY_URL selects OfflineMeridian, as an unset one does.
    RELAY_URL: '',
    // Every e2e server runs a manual ship on seed 7 (spec 8.3).
    SIM_MODE: 'manual',
    SIM_SEED: '7',
    // Vitest sets NODE_ENV=test. A reader's shell leaves it unset, and
    // spawn() passes no variable whose value is undefined.
    NODE_ENV: undefined,
  };
  return spawn(process.execPath, ['--import', 'tsx', `src/${entry}`], {
    cwd: join(import.meta.dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Resolves the URL the entry prints once it listens, or rejects with its stderr if it exits first. */
function urlOf(child: ChildProcess): Promise<{ url: string; port: number }> {
  let stdout = '';
  let stderr = '';
  child.stderr?.on('data', (chunk) => (stderr += String(chunk)));
  return new Promise((resolve, reject) => {
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
      const match = LISTENING.exec(stdout);
      if (match) resolve({ url: match[1], port: Number(match[2]) });
    });
    child.once('exit', (code, signal) =>
      reject(
        new Error(
          `the entry exited (code ${code}, signal ${signal}) before it printed its URL.\n${stderr}`,
        ),
      ),
    );
  });
}

describe.concurrent('the Node server entries', () => {
  it.each(['server.hono.ts', 'server.express.ts', 'server.fastify.ts'])(
    '%s prints its URL, serves /health and exits 0 on SIGTERM',
    async (entry) => {
      const child = start(entry);
      onTestFinished(() => {
        if (child.exitCode === null && child.signalCode === null)
          child.kill('SIGKILL');
      });

      const { url, port } = await urlOf(child);
      expect(port).not.toBe(0);
      const res = await fetch(`${url}/health`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('ok');

      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const [code, signal] = await exited;
      expect({ code, signal }).toEqual({ code: 0, signal: null });
    },
  );
});
