import type { TraceEvent } from '@nexusdi/core';

import seed from '../fixtures/seed.json';
import type { Initial } from './PreflightBay';
import { levelLines, powerAfter } from './power';
import { SEED_STATE } from './state';
import type { LogLine } from './terminal';

/**
 * What the server renders the bay from: the seed fixture that
 * `scene-fixtures.mjs` wrote by running `Nexus.check` and `Nexus.create` on the
 * seed. The terminal is the fixture's check text, and the lit ship is the
 * fixture's trace folded with the same reducer the launch uses.
 */

const fixture = seed as unknown as {
  terminal: { check: string };
  launch: { trace: TraceEvent[] } | null;
};

let cached: Initial | undefined;

export function seedInitial(): Initial {
  if (cached) return cached;
  const lines = fixture.terminal.check.split('\n');
  const log: LogLine[] = lines.map((text, at) => ({
    source: at === 1 ? 'node' : 'shell',
    text,
    ...(at === lines.length - 1 ? { status: 'ok' as const } : {}),
  }));
  const trace = fixture.launch?.trace ?? [];
  cached = {
    log,
    levels: levelLines(trace),
    power: powerAfter(SEED_STATE, trace),
  };
  return cached;
}
