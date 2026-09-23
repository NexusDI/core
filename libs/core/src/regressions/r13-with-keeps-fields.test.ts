import { describe, expect, it } from 'vitest';

import { defineModule, moduleInternals } from '../definitions/define-module.js';
import { Token } from '../definitions/token.js';

describe('R13', () => {
  it('keeps imports, exports and providers on a module returned by with()', () => {
    class SubspaceLink {}
    const Engineering = defineModule({ name: 'Engineering' });
    const COMMS_OPTIONS = new Token<{ frequency: number }>('CommsOptions');
    const Comms = defineModule({
      name: 'Comms',
      options: COMMS_OPTIONS,
      imports: [Engineering],
      providers: [SubspaceLink],
      exports: [SubspaceLink, Engineering],
      global: true,
    });

    const tuned = Comms.with({ frequency: 1420 });

    expect(tuned).toMatchObject({
      name: 'Comms',
      imports: [Engineering],
      providers: [SubspaceLink],
      exports: [SubspaceLink, Engineering],
      global: true,
    });
    expect(moduleInternals(tuned)?.base).toBe(Comms);
  });
});
