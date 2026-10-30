import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

import { expect, it } from 'vitest';

/** Runs scripts/dev-relay.mjs with `command` after `--`, as the profile target does. */
function runWith(command: string) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/dev-relay.mjs',
      '--',
      process.execPath,
      '-e',
      command,
    ],
    { encoding: 'utf8', timeout: 20_000 },
  );
}

it('serves the charts, the handshake and the sign-off to a command it runs, then stops', () => {
  const result = runWith(`
    const url = process.env.RELAY_URL;
    const charts = await fetch(url + '/charts');
    const table = await charts.json();
    const handshake = await fetch(url + '/handshake', { method: 'POST' });
    const signOff = await fetch(url + '/signoff', {
      method: 'POST',
      body: JSON.stringify({ tick: 1, output: 3 }),
    });
    console.log(JSON.stringify([charts.status, Object.keys(table).length > 0, handshake.status, signOff.status]));
  `);
  expect(result.stdout).toContain('[200,true,204,204]');
  expect(result.status).toBe(0);
});

it('answers with the exit code of the command', () => {
  expect(runWith('process.exit(3)').status).toBe(3);
});

it('exits 127 with a message and stops the relay when the command is missing', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/dev-relay.mjs',
      '--',
      'no-such-command-for-dev-relay',
    ],
    { encoding: 'utf8', timeout: 20_000 },
  );
  expect(result.status).toBe(127);
  expect(result.stderr).toContain('no-such-command-for-dev-relay');
});

it('exits 128 plus the signal number when the command dies of a signal', () => {
  expect(runWith("process.kill(process.pid, 'SIGKILL')").status).toBe(137);
});

it('forwards SIGTERM to the command and exits 143', async () => {
  const relay = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/dev-relay.mjs',
      '--',
      process.execPath,
      '-e',
      "console.log('up ' + process.pid); setInterval(() => {}, 1000)",
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  let childPid = 0;
  try {
    await new Promise<void>((resolve) => {
      relay.stdout.on('data', (chunk: Buffer) => {
        const match = /up (\d+)/.exec(chunk.toString());
        if (match) {
          childPid = Number(match[1]);
          resolve();
        }
      });
    });
    relay.kill('SIGTERM');
    const [code] = await once(relay, 'exit');
    expect(code).toBe(143);
  } finally {
    if (relay.exitCode === null && relay.signalCode === null) {
      relay.kill('SIGKILL');
    }
    try {
      process.kill(childPid, 'SIGKILL');
    } catch {
      // The relay forwarded the signal and the command is gone.
    }
  }
}, 30_000);
