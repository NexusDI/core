import { describe, it } from 'vitest';

import { fireRailgun } from '../../test/runtime/growth-cases';
import { manual, withShip } from './ship';

// The two railgun shots of test/runtime/growth-cases.ts on the Node servers.
// The workerd, Deno and Bun legs run the same case.
describe.each(['hono', 'express', 'fastify'] as const)(
  'two railgun shots on %s',
  (framework) => {
    it(fireRailgun.name, () =>
      withShip(framework, manual, (url) =>
        fireRailgun.run((path, init) => fetch(`${url}${path}`, init)),
      ),
    );
  },
);
