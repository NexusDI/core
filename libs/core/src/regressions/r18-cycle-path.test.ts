import { describe, expect, it } from 'vitest';

import { compileErrors } from '../../test-support/compile.js';
import { expectCoreLine } from '../../test-support/modes.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import type { NexusError } from '../errors/index.js';

describe('R18', () => {
  it('reports the full cycle path in NEXUS_CIRCULAR_DEPENDENCY', () => {
    class Helm {
      constructor(readonly nav: unknown) {}
    }
    class Navigation {
      constructor(readonly sensors: unknown) {}
    }
    class Sensors {
      constructor(readonly helm: unknown) {}
    }
    const Bridge = defineModule({
      name: 'Bridge',
      providers: [
        provide(Helm, { deps: [Navigation] }),
        provide(Navigation, { deps: [Sensors] }),
        provide(Sensors, { deps: [Helm] }),
      ],
    });

    const [error] = compileErrors(Bridge);

    expect(error).toMatchObject({
      code: 'NEXUS_CIRCULAR_DEPENDENCY',
      path: ['Helm', 'Navigation', 'Sensors', 'Helm'],
    });
    expectCoreLine(error as NexusError);
  });
});
