import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { TraceEvent } from '@nexusdi/core';

import type { BayState } from './state';

/** A fixture file of `scene-fixtures.mjs`, as the bay's tests read it. */
export interface Fixture {
  id: string;
  title: string;
  state: BayState;
  check: {
    withErrors: { ok: boolean; error: FixtureError | null };
    plain: { ok: boolean; error: FixtureError | null };
  };
  terminal: { check: string; checkPlain: string; launch: string | null };
  launch: {
    ok: boolean;
    error: FixtureError | null;
    readout: string | null;
    lookup: { has: boolean; error: FixtureError } | null;
    trace: TraceEvent[];
  } | null;
}

export interface FixtureError {
  code: string;
  fields: Record<string, unknown>;
  message: string;
  entries?: FixtureError[];
  cause?: { message: string };
}

const DIR = join(import.meta.dirname, '..', 'fixtures');

/** Every state fixture the build wrote, by id. */
export function readFixtures(): Fixture[] {
  return readdirSync(DIR)
    .filter((name) => name.endsWith('.json') && name !== 'modules.json')
    .sort()
    .map(
      (name) => JSON.parse(readFileSync(join(DIR, name), 'utf8')) as Fixture,
    );
}
