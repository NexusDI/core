import { Nexus } from '@nexusdi/core';

import { cases, type Leg } from '../../e2e/cases';
import { honoMissionRoutes } from '../../e2e/fixtures/mission-routes';
import { createBridge } from '../../src/entries/hono';
import { OfflineMeridian } from '../../src/ship/meridian.module';
import { serve } from './serve';

// The bridge API's e2e cases on Deno or Bun, over OfflineMeridian, the
// graph every runtime leg runs. Each mismatch is printed, and
// any mismatch fails the run.
const failures: string[] = [];
for (const each of cases) {
  const leg: Leg = {
    framework: 'hono',
    start: (ship, scopes) =>
      serve(
        createBridge(ship, { scopes, mount: honoMissionRoutes(scopes) }).fetch,
      ),
    ship: (plugins = []) => Nexus.create(OfflineMeridian, { plugins }),
    check(what, actual, expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        failures.push(
          `${each.name}: ${what}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`,
        );
    },
  };
  await each.run(leg);
}
for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(
  failures.length === 0
    ? `PASS bridge-api runtime checks (${cases.length} cases)`
    : `${failures.length} failure(s)`,
);
if (failures.length > 0) throw new Error('runtime checks failed');
