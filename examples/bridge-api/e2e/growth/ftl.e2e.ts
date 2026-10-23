import { describe, it } from 'vitest';

import { spoolAndJump } from '../../test/runtime/growth-cases';
import { manual, withShip } from './ship';

// The spool and jump of test/runtime/growth-cases.ts on the Node servers. The
// workerd, Deno and Bun legs run the same case.
describe.each(['hono', 'express', 'fastify'] as const)(
  'a spool and a jump on %s',
  (framework) => {
    it(spoolAndJump.name, () =>
      withShip(framework, manual, (url) =>
        spoolAndJump.run((path, init) => fetch(`${url}${path}`, init)),
      ),
    );
  },
);
