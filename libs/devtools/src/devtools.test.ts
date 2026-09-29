import { describe, expect, it } from 'vitest';

import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

import { devtools, graph, inspect, type TraceEvent } from './index.js';

const CHARTS = new Token<string>('Charts');
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(CHARTS, { useFactory: async () => 'sector-7' })],
  exports: [CHARTS],
});
const Science = defineModule({ name: 'Science' });

describe('graph', () => {
  it('describes each container a reused devtools() is registered in', async () => {
    const tools = devtools();
    const a = await Nexus.create(Tactical, { plugins: [tools] });
    const b = await Nexus.create(Science, { plugins: [tools] });
    expect(graph(a).modules.map((m) => m.name)).toEqual(['Tactical']);
    expect(graph(b).modules.map((m) => m.name)).toEqual(['Science']);
    expect(graph(a).providers.find((p) => p.token === 'Charts')?.async).toBe(
      true,
    );
  });

  it('follows load()', async () => {
    const ship = await Nexus.create(Tactical, { plugins: [devtools()] });
    await ship.load(Science);
    expect(graph(ship).modules.map((m) => m.name)).toEqual([
      'Tactical',
      'Science',
    ]);
  });

  it('throws NEXUS_DEVTOOLS_UNREGISTERED for a container without devtools()', async () => {
    const ship = await Nexus.create(Science);
    expect(() => graph(ship)).toThrow(
      expect.objectContaining({
        code: 'NEXUS_DEVTOOLS_UNREGISTERED',
        message:
          "[NEXUS_DEVTOOLS_UNREGISTERED] graph() reads the container through devtools(), and this container was created without it.\n  Fix: register devtools() in Nexus.create's plugins: Nexus.create(Root, { plugins: [devtools()] }).",
      }),
    );
  });
});

describe('inspect', () => {
  it('returns the graph of the last compile, building nothing', () => {
    const view = inspect(Tactical, { load: [Science] });
    expect(view.modules.map((m) => m.name)).toEqual(['Tactical', 'Science']);
    expect(view.providers.every((p) => p.async === null)).toBe(true);
  });

  it('reports async null for every provider, a transient factory and a class among them', () => {
    class Probe {}
    const DRONE = new Token<string>('Drone');
    const ALIAS = new Token<Probe>('Alias');
    const view = inspect(
      defineModule({
        name: 'Survey',
        providers: [
          Probe,
          provide(DRONE, { useFactory: () => 'drone', lifetime: 'transient' }),
          provide(ALIAS, { useExisting: Probe }),
        ],
      }),
    );
    expect(view.providers.map((p) => [p.kind, p.async])).toEqual([
      ['class', null],
      ['factory', null],
      ['alias', null],
      ['value', null],
    ]);
  });

  it('accepts errors() and devtools() in options.plugins', () => {
    const view = inspect(Tactical, { plugins: [errors(), devtools()] });
    expect(view.modules.map((m) => m.name)).toEqual(['Tactical']);
  });

  it('throws the BlueprintError Nexus.check throws, with @nexusdi/errors text', () => {
    const Broken = defineModule({
      name: 'Broken',
      providers: [
        provide(CHARTS, { useValue: 'x', lifetime: 'scoped' } as never),
      ],
    });
    expect(() => inspect(Broken)).toThrow(
      expect.objectContaining({
        code: 'NEXUS_BLUEPRINT_INVALID',
        errors: [
          expect.objectContaining({
            message:
              '[NEXUS_INVALID_PROVIDER] Broken.providers[0] sets a lifetime on useValue; a value has none.',
          }),
        ],
      }),
    );
  });
});

describe('devtools', () => {
  it('formats errors as @nexusdi/errors does', async () => {
    const Broken = defineModule({
      name: 'Broken',
      providers: [
        provide(CHARTS, { useValue: 'x', lifetime: 'scoped' } as never),
      ],
    });
    const error = await Nexus.create(Broken, { plugins: [devtools()] }).then(
      () => undefined,
      (caught: { errors: { message: string }[] }) => caught,
    );
    expect(error?.errors[0]?.message).toBe(
      '[NEXUS_INVALID_PROVIDER] Broken.providers[0] sets a lifetime on useValue; a value has none.',
    );
  });

  it('registers observe only when options.trace is set', async () => {
    expect(Object.hasOwn(devtools(), 'observe')).toBe(false);
    const events: TraceEvent[] = [];
    await Nexus.create(Science, {
      plugins: [devtools({ trace: (event) => events.push(event) })],
    });
    expect(events.map((event) => event.type)).toEqual(['compile']);
  });
});
