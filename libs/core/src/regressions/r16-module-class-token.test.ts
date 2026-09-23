import { describe, expect, it } from 'vitest';

import { thrown } from '../../test-support/catch.js';
import {
  defineModule,
  registerModuleClass,
} from '../definitions/define-module.js';
import { Nexus } from '../runtime/nexus.js';
import type { Scope } from '../runtime/scope.js';

describe('R16', () => {
  it('returns false from has and throws NEXUS_INVALID_TOKEN from get for an @Module class', async () => {
    class ReactorCore {}
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [ReactorCore],
      exports: [ReactorCore],
    });
    // What @Module does to a class (Task 34).
    class Command {}
    registerModuleClass(
      Command,
      defineModule({
        name: 'Command',
        imports: [Engineering],
        exports: [Engineering],
      }),
    );

    const ship = await Nexus.create(Command);
    await using shuttle = await ship.createScope();

    const containers: Pick<Scope, 'get' | 'has'>[] = [ship, shuttle];
    for (const container of containers) {
      expect(container.has(Command)).toBe(false);
      expect(container.has(Command, { module: Engineering })).toBe(false);
      expect(thrown(() => container.get(Command))).toMatchObject({
        code: 'NEXUS_INVALID_TOKEN',
        received: 'the function Command',
      });
      expect(
        thrown(() => container.get(Command, { module: Engineering })),
      ).toMatchObject({ code: 'NEXUS_INVALID_TOKEN' });
    }
  });
});
