import {
  Nexus,
  type ModuleRef,
  type NexusPlugin,
  type RootRef,
} from '@nexusdi/core';

import { profile, type Profiler } from './profile.js';
import type { ProfileReport } from './report.js';

/**
 * create with a profiler, each load in order, then disposal. Rejects with
 * the error of a failed create or load after disposing what was built; the
 * profiler passed in still holds the partial report. A failed disposal
 * counts in report().dispose.errors and does not reject.
 */
export async function profileStartup(
  root: RootRef,
  options: {
    readonly plugins?: readonly NexusPlugin[];
    readonly load?: readonly ModuleRef[];
    /** Pass one to read report() while the run is still going, as the CLI's --timeout does. */
    readonly profiler?: Profiler;
  } = {},
): Promise<ProfileReport> {
  const profiler = options.profiler ?? profile();
  const ship = await Nexus.create(root as never, {
    plugins: [profiler, ...(options.plugins ?? [])],
  });
  try {
    for (const module of options.load ?? []) await ship.load(module);
  } catch (error) {
    await ship[Symbol.asyncDispose]().catch(() => undefined);
    throw error;
  }
  await ship[Symbol.asyncDispose]().catch(() => undefined);
  return profiler.report();
}
