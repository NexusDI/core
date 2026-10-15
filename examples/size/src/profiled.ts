import { Nexus } from '@nexusdi/core';
import type { Profiler } from '@nexusdi/devtools';

import { App, UserService } from './app.ts';

/** Starts the app with `profiler` and reads its report, so the bundle keeps both. */
export async function startProfiled(profiler: Profiler): Promise<void> {
  const app = await Nexus.create(App, { plugins: [profiler] });
  app.get(UserService).logger.log('ready');
  console.log(profiler.report().runs.length);
}
