import { Nexus } from '@nexusdi/core';
import * as tools from '@nexusdi/devtools';
import { SHIP_SYSTEMS } from '@nexusdi/meridian-systems';
import { createTestingContainer } from '@nexusdi/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { startRelay } from '../e2e/relay';

import { introspect } from '../src/bridge/profile';
import { SUBSPACE_LINK } from '../src/ship/contracts';
import { Meridian, OfflineMeridian } from '../src/ship/meridian.module';
import { bridgePlugins } from '../src/ship/plugins';
import { relayMeridian } from '../src/ship/relay-meridian';
import { FixedLink } from './doubles';
import { calls } from './route-helpers';
import { FRAMEWORKS } from './support';

it('profiles the LifeSupportOptions factory as the async step of startup', async () => {
  const profiler = tools.profile();
  const ship = await Nexus.create(OfflineMeridian, {
    plugins: [...bridgePlugins(), profiler],
  });
  await ship[Symbol.asyncDispose]();
  const report = profiler.report();
  expect(report.graph?.root).toBe('OfflineMeridian');
  const [create] = report.runs;
  expect(create).toMatchObject({ kind: 'create', ok: true });
  // readCalibration is async and reads SHIP_FILES, so the container awaits
  // the options one level after it builds the files, before LifeSupport's
  // physics, power and analyzer build on them.
  const awaited = create.builds.filter((build) => build.async);
  expect(awaited).toEqual([
    expect.objectContaining({
      token: 'LifeSupportOptions',
      module: 'LifeSupport',
      lifetime: 'singleton',
      level: 1,
      failed: false,
    }),
  ]);
  expect(report.graph?.providers).toContainEqual(
    expect.objectContaining({
      token: 'LifeSupportOptions',
      module: 'LifeSupport',
      kind: 'factory',
    }),
  );
});

describe('profile over the relay', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lists the NavCharts download and the relay handshake onInit', async () => {
    const relay = await startRelay();
    try {
      vi.stubEnv('RELAY_URL', relay.url);
      const profiler = tools.profile();
      const ship = await Nexus.create(relayMeridian(), {
        plugins: [...bridgePlugins(), profiler],
      });
      await ship[Symbol.asyncDispose]();
      const table = tools.profileTable(profiler.report());
      expect(table).toContain('NavCharts');
      expect(table).toContain('onInit');
      expect(relay.downloads()).toBe(1);
      expect(relay.handshakes()).toBe(1);
    } finally {
      await relay.close();
    }
  });
});

it('profiles the charts download of Meridian beside the LifeSupportOptions factory', async () => {
  const profiler = tools.profile();
  const ship = await createTestingContainer(Meridian)
    .override(SUBSPACE_LINK, { useClass: FixedLink })
    .create({ plugins: [...bridgePlugins(), profiler] });
  await ship[Symbol.asyncDispose]();
  const report = profiler.report();
  expect(report.graph?.root).toBe('Meridian');
  const [create] = report.runs;
  expect(create).toMatchObject({ kind: 'create', ok: true });
  // NavCharts's factory takes SUBSPACE_LINK, so the container awaits the
  // charts download one level after it builds the link.
  const awaited = create.builds.filter((build) => build.async);
  expect(awaited).toEqual([
    expect.objectContaining({
      token: 'NavCharts',
      module: 'Tactical',
      lifetime: 'singleton',
      level: 1,
      failed: false,
    }),
    expect.objectContaining({
      token: 'LifeSupportOptions',
      module: 'LifeSupport',
      lifetime: 'singleton',
      level: 1,
      failed: false,
    }),
  ]);
  for (const [token, module] of [
    ['LifeSupportOptions', 'LifeSupport'],
    ['NavCharts', 'Tactical'],
  ]) {
    expect(report.graph?.providers).toContainEqual(
      expect.objectContaining({ token, module, kind: 'factory' }),
    );
  }
});

describe.each(FRAMEWORKS)('GET /profile on %s', (framework) => {
  const call = calls[framework];

  it('answers 404 when the profile option is off', async () => {
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: bridgePlugins(),
    });
    expect((await call(ship, 'GET', '/profile')).status).toBe(404);
  });

  it('introspect brings a black box that records the startup', async () => {
    const introspection = introspect(tools);
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: [...bridgePlugins(), ...introspection.plugins],
    });
    ship.get(SHIP_SYSTEMS);
    expect(introspection.plugins).toContain(introspection.box.plugin);
    expect(introspection.box.trace().length).toBeGreaterThan(0);
    expect(introspection.box.stamps().length).toBeGreaterThan(0);
  });

  it('answers the table and the critical path of startup when it is on', async () => {
    const introspection = introspect(tools);
    await using ship = await createTestingContainer(Meridian)
      .override(SUBSPACE_LINK, { useClass: FixedLink })
      .create({ plugins: [...bridgePlugins(), ...introspection.plugins] });
    const { status, body } = await call(
      ship,
      'GET',
      '/profile',
      undefined,
      introspection.options(ship),
    );
    expect(status).toBe(200);
    const { table, criticalPath } = body as {
      table: string;
      criticalPath: { path: unknown[] } | null;
    };
    expect(table).toContain('LifeSupportOptions');
    expect(table).toContain('NavCharts');
    expect(criticalPath?.path.length).toBeGreaterThan(0);
  });
});

describe.each(FRAMEWORKS)('GET /graph and /profile on %s', (framework) => {
  const call = calls[framework];

  it.each(['/graph', '/profile'])(
    'answers 404 on %s when the option answers undefined',
    async (path) => {
      await using ship = await Nexus.create(OfflineMeridian, {
        plugins: bridgePlugins(),
      });
      const { status } = await call(ship, 'GET', path, undefined, {
        graph: async () => undefined,
        profile: async () => undefined,
      });
      expect(status).toBe(404);
    },
  );

  it('answers 500 when the option throws while it answers', async () => {
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: bridgePlugins(),
    });
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const { status } = await call(ship, 'GET', '/profile', undefined, {
      profile: () => circular as never,
      log: () => undefined,
    });
    expect(status).toBe(500);
  });
});
