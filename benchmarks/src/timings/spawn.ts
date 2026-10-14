/**
 * Spawns one fresh Node process and times it from just before the spawn to
 * its first IPC message. Cold start and the scale fresh-process block share
 * it; the child sends exactly one message and the next spawn waits for the
 * process to exit.
 */
import { fork } from 'node:child_process';

export interface Spawned<M> {
  /** Spawn to the child's message, ns. */
  ns: number;
  message: M;
}

export function spawnChild<M>(
  script: string,
  args: readonly string[],
  execArgv: readonly string[],
  env?: NodeJS.ProcessEnv,
): Promise<Spawned<M>> {
  return new Promise((resolve, reject) => {
    const t0 = process.hrtime.bigint();
    const child = fork(script, [...args], {
      execArgv: [...execArgv],
      ...(env === undefined ? {} : { env }),
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    let got: Spawned<M> | undefined;
    child.once('message', (message: M) => {
      got = { ns: Number(process.hrtime.bigint() - t0), message };
    });
    child.once('exit', (code) =>
      got !== undefined
        ? resolve(got)
        : reject(new Error(`exited with code ${code}: ${stderr.trim()}`)),
    );
  });
}
