import { workspaceRoot } from '@nx/devkit';

const cwd = `${workspaceRoot}/examples`;

/**
 * One static server from e2e/serve.ts, ready once `ready` answers. `env`
 * reaches serve.ts, where REMOTES and BRIDGE_API_URL pick what the shell's
 * /remotes.json and /bridge.json answer.
 */
export function serve(
  folder: string,
  port: number,
  ready: string,
  env: Record<string, string> = {},
) {
  return {
    command: `node federation-shell/e2e/serve.ts ${folder} ${port}`,
    url: `http://127.0.0.1:${port}${ready}`,
    reuseExistingServer: false,
    cwd,
    env,
  };
}

/**
 * bridge-api's Hono entry on `port`, a manual ship on seed 7 as every e2e
 * server runs. It answers `shellOrigin` with CORS
 * headers, so a shell on that origin reads its telemetry and posts commands.
 */
export function bridgeApi(port: number, shellOrigin: string) {
  return {
    command: 'node --import tsx bridge-api/src/entries/server.hono.ts',
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    cwd,
    env: {
      PORT: String(port),
      SIM_MODE: 'manual',
      SIM_SEED: '7',
      SHELL_ORIGIN: shellOrigin,
    },
  };
}
