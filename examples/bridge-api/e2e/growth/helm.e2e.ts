import { describe, it } from 'vitest';

import { courseAndBurn } from '../../test/runtime/growth-cases';
import { manual, withShip } from './ship';

// The course and burn of test/runtime/growth-cases.ts on the Node servers. The
// workerd, Deno and Bun legs run the same case.
describe.each(['hono', 'express', 'fastify'] as const)(
  'a course and a burn on %s',
  (framework) => {
    it(courseAndBurn.name, () =>
      withShip(framework, manual, (url) =>
        courseAndBurn.run((path, init) => fetch(`${url}${path}`, init)),
      ),
    );
  },
);
