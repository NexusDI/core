import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { defineModule } from '../definitions/define-module.js';
import { Nexus } from '../runtime/nexus.js';

describe('R15', () => {
  it('rejects a provider object without a token', async () => {
    const Broken = defineModule({
      name: 'Broken',
      providers: [{ useValue: 42 } as never],
    });
    expect(await rejected(Nexus.create(Broken))).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [{ code: 'NEXUS_INVALID_PROVIDER', module: 'Broken', index: 0 }],
    });
  });
});
