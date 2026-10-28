import {
  Nexus,
  splitLoadEntry,
  type LoadEntry,
  type NexusPlugin,
  type RootRef,
} from '@nexusdi/core';

import { profile, type Profiler } from './profile.js';
import type { ProfileReport } from './report.js';

/**
 * Runs one startup and returns its report: Nexus.create with the profiler,
 * each load in order, then disposal. Rejects with
 * the error of a failed create or load after disposing what was built; the
 * profiler passed in still holds the partial report. A failed disposal
 * counts in report().dispose.errors and does not reject.
 */
export async function profileStartup(
  root: RootRef,
  options: {
    readonly plugins?: readonly NexusPlugin[];
    /** Modules to load in order. An entry `{ module, imports }` loads with that grant, as `Nexus.load(module, { imports })` does. */
    readonly load?: readonly LoadEntry[];
    /** Pass one to read report() while the run is still going, as the CLI's --timeout does. */
    readonly profiler?: Profiler;
  } = {},
): Promise<ProfileReport> {
  const profiler = options.profiler ?? profile();
  const ship = await Nexus.create(root as never, {
    plugins: [profiler, ...(options.plugins ?? [])],
  });
  try {
    for (const entry of options.load ?? []) {
      const { module, imports } = splitLoadEntry(entry);
      await ship.load(module, { imports });
    }
  } catch (error) {
    await ship[Symbol.asyncDispose]().catch(() => undefined);
    throw error;
  }
  await ship[Symbol.asyncDispose]().catch(() => undefined);
  return profiler.report();
}
