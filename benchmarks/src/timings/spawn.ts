/**
 * Spawns one fresh Node process and times it from just before the spawn to
 * its message of the expected type. Cold start and the scale fresh-process
 * block share it. The child sends one such message; the next spawn waits for
 * the process to exit, and any non-zero exit rejects, message or not.
 */
import { fork } from 'node:child_process';

export interface Spawned<M> {
  /** Spawn to the child's message, ns. */
  ns: number;
  message: M;
}

export function spawnChild<M extends { type: string }>(
  script: string,
  args: readonly string[],
  execArgv: readonly string[],
  type: M['type'],
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
    child.on('message', (message: M) => {
      if (got === undefined && message.type === type)
        got = { ns: Number(process.hrtime.bigint() - t0), message };
    });
    child.once('error', (error) =>
      reject(new Error(`could not run ${script}: ${error.message}`)),
    );
    // In Node 24 `close` does not wait for the IPC channel, and `disconnect`
    // can come after `close` (46 of 60 runs). The last message is delivered
    // before `disconnect`, so the outcome waits for both events.
    let ended:
      { code: number | null; signal: NodeJS.Signals | null } | undefined;
    let closed = !child.connected;
    const settle = () => {
      if (ended === undefined || !closed) return;
      const { code, signal } = ended;
      if (code === 0 && got !== undefined) return resolve(got);
      const how = code === null ? `signal ${signal}` : `code ${code}`;
      const why =
        code === 0 ? `sent no ${type} message` : stderr.trim() || 'no stderr';
      reject(new Error(`exited with ${how}: ${why}`));
    };
    child.once('close', (code, signal) => {
      ended = { code, signal };
      settle();
    });
    child.once('disconnect', () => {
      closed = true;
      settle();
    });
  });
}
