import { describe, expect, it } from 'vitest';

import { Inject, Injectable, Module, Nexus, optional } from '../index.js';

describe('R21', () => {
  it('resolves an optional dep and an optional property with no provider to undefined', async () => {
    class Logger {}
    @Injectable({ deps: [optional(Logger)] })
    class UserService {
      @Inject(optional(Logger)) accessor audit!: Logger | undefined;
      constructor(readonly logger?: Logger) {}
    }
    @Module({ providers: [UserService] })
    class App {}

    const service = (await Nexus.create(App)).get(UserService);

    expect(service.logger).toBeUndefined();
    expect(service.audit).toBeUndefined();
  });
});
