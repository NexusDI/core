import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import type { BlueprintView, ProviderView } from '../blueprint/views.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';
import type { NexusPlugin } from './plugins.js';

interface ILogger {
  log(line: string): void;
}
interface ISensorArray {
  readonly range: number;
}
interface IBridgeSession {
  readonly logger: ILogger;
}
interface IProbeLauncher {
  readonly armed: boolean;
}
const LOGGER = new Token<ILogger>('Logger');
const SENSORS = new Token<ISensorArray>('SensorArray');
const SESSION = new Token<IBridgeSession>('BridgeSession');
const LAUNCHER = new Token<IProbeLauncher>('ProbeLauncher');

class ConsoleLogger implements ILogger {
  log(): void {}
}
class LongRangeSensors implements ISensorArray {
  readonly range = 9000;
}
class BridgeSession implements IBridgeSession {
  constructor(readonly logger: ILogger) {}
}
class ProbeLauncher implements IProbeLauncher {
  readonly armed = true;
}

const Bridge = defineModule({
  name: 'Bridge',
  providers: [
    provide(LOGGER, { useClass: ConsoleLogger }),
    provide(SENSORS, { useClass: LongRangeSensors, eager: false }),
    provide(SESSION, {
      useClass: BridgeSession,
      deps: [LOGGER],
      lifetime: 'scoped',
    }),
  ],
  exports: [LOGGER, SENSORS, SESSION],
});

const Science = defineModule({
  name: 'Science',
  providers: [provide(LAUNCHER, { useClass: ProbeLauncher })],
  exports: [LAUNCHER],
});

/**
 * A plugin that keeps each compile's check-view providers, by phase, and
 * records every provider view construct receives, by provider name.
 */
function viewRecorder(): {
  readonly plugin: NexusPlugin;
  readonly checked: Map<BlueprintView['phase'], Set<ProviderView>>;
  readonly constructed: Map<string, ProviderView>;
} {
  const checked = new Map<BlueprintView['phase'], Set<ProviderView>>();
  const constructed = new Map<string, ProviderView>();
  return {
    checked,
    constructed,
    plugin: {
      name: 'test:view-identity',
      apiVersion: 1,
      compile: {
        check: (view) => void checked.set(view.phase, new Set(view.providers)),
      },
      construct: (_instance, provider) => {
        constructed.set(provider.name, provider);
        return undefined;
      },
    },
  };
}

class ReportedError extends Error {
  readonly code = 'NEXUS_TEST_REPORTED';
}

describe('construct', () => {
  it("receives the create check's provider views for root, scoped and lazy singleton builds", async () => {
    const { plugin, checked, constructed } = viewRecorder();
    const ship = await Nexus.create(Bridge, { plugins: [plugin] });
    ship.get(SENSORS);
    await using scope = await ship.createScope();
    scope.get(SESSION);
    const seen = checked.get('create');
    expect([...constructed.keys()].sort()).toEqual([
      'BridgeSession',
      'Logger',
      'SensorArray',
    ]);
    for (const provider of constructed.values())
      expect(seen?.has(provider)).toBe(true);
  });

  it("receives the load check's provider views for loaded providers and lazy singletons first built after the load", async () => {
    const { plugin, checked, constructed } = viewRecorder();
    const ship = await Nexus.create(Bridge, { plugins: [plugin] });
    await ship.load(Science);
    ship.get(SENSORS);
    const seen = checked.get('load');
    expect(seen?.has(constructed.get('ProbeLauncher') as ProviderView)).toBe(
      true,
    );
    expect(seen?.has(constructed.get('SensorArray') as ProviderView)).toBe(
      true,
    );
  });

  it("receives the next successful create's own check views after a compile fails", async () => {
    const { plugin, checked, constructed } = viewRecorder();
    let fail = true;
    const reporter: NexusPlugin = {
      name: 'test:reporter',
      apiVersion: 1,
      compile: {
        check: (_view, report) => {
          if (fail) report(new ReportedError('rejected once') as never);
        },
      },
    };
    await rejected(Nexus.create(Bridge, { plugins: [plugin, reporter] }));
    const failed = checked.get('create');
    fail = false;
    await Nexus.create(Bridge, { plugins: [plugin, reporter] });
    const seen = checked.get('create');
    const logger = constructed.get('Logger') as ProviderView;
    expect(seen?.has(logger)).toBe(true);
    expect(failed?.has(logger)).toBe(false);
  });
});
