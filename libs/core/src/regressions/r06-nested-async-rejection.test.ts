import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { deferred, flush } from '../../test-support/deferred.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from '../runtime/nexus.js';

describe('R06', () => {
  const unhandled: unknown[] = [];
  const record = (reason: unknown) => unhandled.push(reason);
  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', record);
  });
  afterEach(() => {
    process.off('unhandledRejection', record);
  });

  it('settles create only after every async factory in every imported module has settled', async () => {
    const offline = new Error('subspace link offline');
    const SENSORS = new Token<string>('Sensors');
    const CHARTS = new Token<string>('Charts');
    const charts = deferred<string>();
    const Deepest = defineModule({
      name: 'Deepest',
      providers: [
        provide(SENSORS, {
          useFactory: () => Promise.reject(offline),
          deps: [],
        }),
      ],
    });
    const Deep = defineModule({ name: 'Deep', imports: [Deepest] });
    const Middle = defineModule({ name: 'Middle', imports: [Deep] });
    const Charts = defineModule({
      name: 'Charts',
      providers: [
        provide(CHARTS, { useFactory: () => charts.promise, deps: [] }),
      ],
    });

    let settled = false;
    const creating = Nexus.create(
      defineModule({ name: 'Meridian', imports: [Middle, Charts] }),
    ).finally(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);

    charts.resolve('sector-7');
    const error = await rejected(creating);

    expect(error).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      token: 'Sensors',
      module: 'Deepest',
      cause: offline,
    });
    await flush();
    expect(unhandled).toEqual([]);
  });
});
