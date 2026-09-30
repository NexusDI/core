import { describe, expect, it, vi } from 'vitest';

import {
  Nexus,
  Token,
  defineModule,
  provide,
  type ErrorTextPack,
} from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

import { rejected, thrown } from '../test-support/catch.js';
import {
  reactorCheck,
  reactorText,
} from '../test-support/third-party-codes.js';
import { devtools, graph, inspect, type TraceEvent } from './index.js';

const CHARTS = new Token<string>('Charts');
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(CHARTS, { useFactory: async () => 'sector-7' })],
  exports: [CHARTS],
});
const Science = defineModule({ name: 'Science' });
const Broken = defineModule({
  name: 'Broken',
  providers: [provide(CHARTS, { useValue: 'x', lifetime: 'scoped' } as never)],
});

const REACTOR_MESSAGE =
  '[ACME_REACTOR_OFFLINE] the aft reactor is offline.\n' +
  '  Fix: start it before the container compiles.';

/** A caller's translation of one core code. */
const swedish = {
  NEXUS_INVALID_PROVIDER: (error) => ({
    message: `${error.module}.providers[${error.index}] är ogiltig.`,
  }),
} satisfies ErrorTextPack;

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

  it('takes a provider array and a root object, as Nexus.check does', () => {
    const fromArray = inspect([provide(CHARTS, { useValue: 'charts' })]);
    const fromObject = inspect({
      providers: [provide(CHARTS, { useValue: 'charts' })],
      imports: [Science],
    });
    expect(fromArray.modules.map((m) => m.name)).toEqual(['root']);
    expect(fromArray.providers.map((p) => p.token)).toContain('Charts');
    expect(fromObject.modules.map((m) => m.name)).toEqual(['root', 'Science']);
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

  it("formats another package's code, raised from a check hook, with options.text", () => {
    expect(
      thrown(() =>
        inspect(Science, { plugins: [reactorCheck], text: [reactorText] }),
      ),
    ).toMatchObject({ errors: [{ message: REACTOR_MESSAGE }] });
  });

  it("lets a caller's translation plugin word a core code ahead of its own formatter", () => {
    expect(
      thrown(() => inspect(Broken, { plugins: [errors({ text: [swedish] })] })),
    ).toMatchObject({
      errors: [
        {
          message: '[NEXUS_INVALID_PROVIDER] Broken.providers[0] är ogiltig.',
        },
      ],
    });
  });

  it('keeps options.text and options.annotate out of Nexus.check', () => {
    const check = vi.spyOn(Nexus, 'check');
    try {
      inspect(Science, {
        text: [reactorText],
        annotate: [() => []],
        load: [Tactical],
      });
      expect(check).toHaveBeenCalledOnce();
      expect(Object.keys(check.mock.calls[0]?.[1] ?? {}).sort()).toEqual([
        'load',
        'plugins',
      ]);
    } finally {
      check.mockRestore();
    }
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

  it("formats another package's code, raised from a check hook, with options.text", async () => {
    expect(
      await rejected(
        Nexus.create(Science, {
          plugins: [reactorCheck, devtools({ text: [reactorText] })],
        }),
      ),
    ).toMatchObject({ errors: [{ message: REACTOR_MESSAGE }] });
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
