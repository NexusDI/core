import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from '../runtime/nexus.js';

describe('R15', () => {
  it('rejects a provider object without a token and produces identical graphs across two creates', async () => {
    const Broken = defineModule({
      name: 'Broken',
      providers: [{ useValue: 42 } as never],
    });
    expect(await rejected(Nexus.create(Broken))).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [{ code: 'NEXUS_INVALID_PROVIDER', module: 'Broken', index: 0 }],
    });

    class ReactorCore {}
    const NAME = new Token<string>('Name');
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [ReactorCore, provide(NAME, { useValue: 'Meridian' })],
    });
    const first = await Nexus.create(Engineering);
    const second = await Nexus.create(Engineering);
    expect(first.graph()).toEqual(second.graph());
  });
});
