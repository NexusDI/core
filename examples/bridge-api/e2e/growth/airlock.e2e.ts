import { describe, it } from 'vitest';

import { airlockDrill } from '../../test/runtime/growth-cases';
import { manual, withShip } from './ship';

// The airlock drill of test/runtime/growth-cases.ts on the Node servers. The
// workerd, Deno and Bun legs run the same case.
describe.each(['hono', 'express', 'fastify'] as const)(
  'the airlock drill on %s',
  (framework) => {
    it(airlockDrill.name, () =>
      withShip(framework, manual, (url) =>
        airlockDrill.run((path, init) => fetch(`${url}${path}`, init)),
      ),
    );
  },
);
