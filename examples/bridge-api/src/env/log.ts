import { isNexusError } from '@nexusdi/core';
import type { NexusLog } from '@nexusdi/hono';

/**
 * The `log` option of the Node entries: one line per error the adapter maps
 * to a 500 or 503, with the adapter, the phase, the status, and the code and
 * message of a `NEXUS_` error. The response body stays empty, so this line is
 * where the cause shows. The same log serves Hono, Express and Fastify, which
 * has no logger of its own here.
 */
export function shipLog(
  write: (line: string) => void = console.error,
): NexusLog {
  return (error, { adapter, phase, status }) => {
    const where = `[${adapter}] ${phase}${status === undefined ? '' : ` ${status}`}:`;
    write(
      isNexusError(error)
        ? `${where} ${error.code} ${error.message.replace(`[${error.code}] `, '')}`
        : `${where} ${error instanceof Error ? error.message : String(error)}`,
    );
  };
}
