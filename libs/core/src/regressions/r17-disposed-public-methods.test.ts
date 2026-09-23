import { describe, expect, it } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import { defineModule } from '../definitions/define-module.js';
import { Nexus } from '../runtime/nexus.js';

describe('R17', () => {
  it('throws NEXUS_DISPOSED from every public method after disposal starts', async () => {
    class Reactor {}
    const Science = defineModule({ name: 'Science' });
    const ship = await Nexus.create(
      defineModule({ name: 'Root', providers: [Reactor] }),
    );
    const shuttle = await ship.createScope();

    const closing = ship[Symbol.asyncDispose]();
    const disposed = { code: 'NEXUS_DISPOSED', target: 'container' };

    expect(thrown(() => ship.get(Reactor))).toMatchObject(disposed);
    expect(thrown(() => ship.has(Reactor))).toMatchObject(disposed);
    expect(thrown(() => ship.resolve({ reactor: Reactor }))).toMatchObject(
      disposed,
    );
    expect(thrown(() => ship.validate({ reactor: Reactor }))).toMatchObject(
      disposed,
    );
    expect(thrown(() => ship.runInScope(shuttle, () => 1))).toMatchObject(
      disposed,
    );
    expect(await rejected(ship.load(Science))).toMatchObject(disposed);
    expect(await rejected(ship.createScope())).toMatchObject(disposed);
    await closing;
    expect(thrown(() => ship.get(Reactor))).toMatchObject(disposed);
  });
});
