import { describe, it } from 'vitest';

import { offlineHail } from '../../test/runtime/growth-cases';
import { manual, withShip } from './ship';

// The offline hail of test/runtime/growth-cases.ts on the Node servers. The
// workerd, Deno and Bun legs run the same case.
describe.each(['hono', 'express', 'fastify'] as const)(
  'the offline hail on %s',
  (framework) => {
    it(offlineHail.name, () =>
      withShip(framework, manual, (url) =>
        offlineHail.run((path, init) => fetch(`${url}${path}`, init)),
      ),
    );
  },
);
