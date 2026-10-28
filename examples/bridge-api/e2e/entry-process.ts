import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

import { onTestFinished } from 'vitest';

const LISTENING = /Server is running on (http:\/\/localhost:(\d+))/;

/**
 * Starts one entry under tsx, on a free port, the offline graph and a manual
 * ship, and kills it when the test finishes if it is still running. A
 * concurrent test passes its own context's `onTestFinished`, since the
 * imported hook can attach to another test that runs at the same time.
 */
export function start(
  entry: string,
  finished: typeof onTestFinished = onTestFinished,
): ChildProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: '0',
    // An empty RELAY_URL selects OfflineMeridian, as an unset one does.
    RELAY_URL: '',
    // Every e2e server runs a manual ship on seed 7, so a tick runs only when
    // a case asks and every leg reads the same ship.
    SIM_MODE: 'manual',
    SIM_SEED: '7',
    // Vitest sets NODE_ENV=test. A reader's shell leaves it unset, and
    // spawn() passes no variable whose value is undefined.
    NODE_ENV: undefined,
  };
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', `src/entries/${entry}`],
    {
      cwd: join(import.meta.dirname, '..'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  finished(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
  });
  return child;
}

/**
 * Resolves the URL the entry prints once it listens, with a getter for all
 * the stderr the entry has written so far, or rejects with its stderr if it
 * exits first.
 */
export function urlOf(
  child: ChildProcess,
): Promise<{ url: string; port: number; stderr(): string }> {
  let stdout = '';
  let stderr = '';
  child.stderr?.on('data', (chunk) => (stderr += String(chunk)));
  return new Promise((resolve, reject) => {
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
      const match = LISTENING.exec(stdout);
      if (match)
        resolve({
          url: match[1],
          port: Number(match[2]),
          stderr: () => stderr,
        });
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
