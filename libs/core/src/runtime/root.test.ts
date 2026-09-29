import { describe, expect, it } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import { expectCoreLine } from '../../test-support/modes.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import type { BlueprintError, NexusError } from '../errors/index.js';
import { Nexus } from './nexus.js';

class Logger {
  log(line: string) {
    return line;
  }
}
class UserService {
  static deps = [Logger] as const;
  constructor(readonly logger: Logger) {}
}

describe('Nexus.create', () => {
  it('takes a provider array as the root module named root', async () => {
    const app = await Nexus.create([Logger, UserService]);
    expect(app.get(UserService).logger).toBe(app.get(Logger));
  });

  it('takes providers, imports and exports as an object', async () => {
    const NAME = new Token<string>('Name');
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [provide(NAME, { useValue: 'Meridian' })],
      exports: [NAME],
    });
    const app = await Nexus.create({
      imports: [Engineering],
      providers: [Logger],
    });
    expect(app.get(NAME)).toBe('Meridian');
  });

  it('gives an empty array and an empty object an empty root', async () => {
    for (const root of [[], {}]) {
      const app = await Nexus.create(root);
      expect(app.has(Logger)).toBe(false);
      expect(thrown(() => app.get(Logger))).toMatchObject({
        code: 'NEXUS_MISSING_PROVIDER',
        module: 'root',
      });
    }
  });

  it('rejects an object with any other key', async () => {
    expect(
      await rejected(
        Nexus.create({ name: 'App', providers: [Logger] } as never),
      ),
    ).toMatchObject({ code: 'NEXUS_INVALID_MODULE' });
  });

  it('rejects a bare class with parameters and no static deps with NEXUS_MISSING_DEPS', async () => {
    class Unwired {
      constructor(readonly logger: Logger) {}
    }
    const error = (await rejected(
      Nexus.create([Logger, Unwired]),
    )) as BlueprintError;
    expect(error.errors).toMatchObject([
      {
        code: 'NEXUS_MISSING_DEPS',
        token: 'Unwired',
        module: 'root',
        arity: 1,
        useClass: null,
        bare: true,
      },
    ]);
    expectCoreLine(error.errors[0] as NexusError);
  });

  it('keeps the root across a load()', async () => {
    const app = await Nexus.create([Logger]);
    await app.load(defineModule({ name: 'Science' }));
    expect(app.get(Logger)).toBeInstanceOf(Logger);
  });
});

describe('Nexus.check', () => {
  it('takes a provider array', () => {
    expect(thrown(() => Nexus.check([UserService]))).toMatchObject({
      errors: [{ code: 'NEXUS_MISSING_PROVIDER', module: 'root' }],
    });
  });
});
