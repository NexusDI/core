import { Nexus } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';

import { createBridge } from '../../src/hono';
import { OfflineMeridian } from '../../src/ship/meridian';
import { bridgePlugins } from '../../src/ship/plugins';
import { growthCases } from './growth-cases';
import { serve } from './serve';

// bridge-api's growth cases on Deno or Bun. Each case gets a fresh
// OfflineMeridian behind Hono, so each one starts at tick 0. The ship and the
// bridge share one nodeScopes(), as src/worker.offline.ts builds them, so the
// interlock and the flight recorder run. Each failure is printed, and any
// failure fails the run.
const failures: string[] = [];
for (const each of growthCases) {
  const scopes = nodeScopes();
  const plugins = bridgePlugins({ scopes });
  const ship = await Nexus.create(OfflineMeridian, { plugins });
  const bridge = await serve(createBridge(ship, { scopes }).fetch);
  try {
    await each.run((path, init) => fetch(`${bridge.url}${path}`, init));
  } catch (error) {
    failures.push(`${each.name}: ${(error as Error).message}`);
  } finally {
    await bridge.close();
    await ship[Symbol.asyncDispose]();
  }
}
for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(
  failures.length === 0
    ? `PASS bridge-api growth checks (${growthCases.length} cases)`
    : `${failures.length} failure(s)`,
);
if (failures.length > 0) throw new Error('growth checks failed');
