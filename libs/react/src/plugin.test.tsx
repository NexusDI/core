import {
  defineModule,
  isNexusError,
  MultiToken,
  Nexus,
  NEXUS_PLUGIN_API,
  provide,
  Token,
  type Scope,
} from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';
import { renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { devtools } from '@nexusdi/devtools';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NexusProvider,
  react,
  TransientInRenderError,
  useService,
} from './index.js';

interface ISurveyDrone {
  launch(): string;
}
const DRONE = new Token<ISurveyDrone>('SurveyDrone');
const DRONE_ALIAS = new Token<ISurveyDrone>('SurveyDroneAlias');
interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const DIAGNOSTICS = new MultiToken<{ system: string }>('Diagnostics');

let built = 0;
class ScoutDrone implements ISurveyDrone {
  constructor() {
    built += 1;
  }
  launch() {
    return 'scout';
  }
}
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

const hook = (ship: Nexus, read: () => unknown, scope?: Scope) =>
  renderHook(read, {
    wrapper: ({ children }: { children?: ReactNode }) => (
      <StrictMode>
        <NexusProvider container={ship} scope={scope}>
          {children}
        </NexusProvider>
      </StrictMode>
    ),
  });

const thrown = (read: () => unknown): unknown => {
  try {
    read();
  } catch (error) {
    return error;
  }
  return undefined;
};

afterEach(() => {
  built = 0;
  vi.restoreAllMocks();
});

describe('react', () => {
  it('rejects a transient token in render and builds nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create(
      [provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' })],
      { plugins: [react()] },
    );
    const error = thrown(() => hook(ship, () => useService(DRONE)));
    expect(error).toBeInstanceOf(TransientInRenderError);
    expect({ ...(error as object) }).toEqual({
      token: 'SurveyDrone',
      provider: 'ScoutDrone',
    });
    expect(built).toBe(0);
  });

  it('follows an alias to a transient target', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create(
      [
        provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' }),
        provide(DRONE_ALIAS, { useExisting: DRONE }),
      ],
      { plugins: [react()] },
    );
    expect(
      thrown(() => hook(ship, () => useService(DRONE_ALIAS))),
    ).toBeInstanceOf(TransientInRenderError);
  });

  it('follows two alias hops to a transient target', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const RELAY = new Token<ISurveyDrone>('DroneRelay');
    await using ship = await Nexus.create(
      [
        provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' }),
        provide(DRONE_ALIAS, { useExisting: DRONE }),
        provide(RELAY, { useExisting: DRONE_ALIAS }),
      ],
      { plugins: [react()] },
    );
    expect(thrown(() => hook(ship, () => useService(RELAY)))).toBeInstanceOf(
      TransientInRenderError,
    );
    expect(built).toBe(0);
  });

  it('reads one blueprint view before and after createScope', async () => {
    let read: (() => unknown) | undefined;
    await using ship = await Nexus.create([], {
      plugins: [
        {
          name: 'acme:probe',
          apiVersion: NEXUS_PLUGIN_API,
          setup(context) {
            read = () => context.blueprint();
          },
        },
      ],
    });
    const before = read?.();
    await using scope = await ship.createScope();
    scope.has(DRONE);
    expect(read?.()).toBe(before);
  });

  it('rejects a MultiToken with one transient contribution', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create(
      [
        provide(DIAGNOSTICS, { useValue: { system: 'reactor' } }),
        provide(DIAGNOSTICS, {
          useFactory: () => ({ system: 'hull' }),
          lifetime: 'transient',
        }),
      ],
      { plugins: [react()] },
    );
    expect(
      thrown(() => hook(ship, () => useService(DIAGNOSTICS))),
    ).toBeInstanceOf(TransientInRenderError);
  });

  it('lets singletons through', async () => {
    await using ship = await Nexus.create(
      [provide(NAV_CHARTS, { useValue: fakeCharts })],
      {
        plugins: [react()],
      },
    );
    const { result, unmount } = hook(ship, () => useService(NAV_CHARTS));
    expect((result.current as INavCharts).plot('Kepler-442b').heading).toBe(42);
    unmount();
  });

  it('leaves an unbound token to get(), which throws its own error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([], { plugins: [react()] });
    const error = thrown(() => hook(ship, () => useService(NAV_CHARTS)));
    expect(isNexusError(error, 'NEXUS_MISSING_PROVIDER')).toBe(true);
  });

  it('checks nothing without react()', async () => {
    await using ship = await Nexus.create([
      provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' }),
    ]);
    const { unmount } = hook(ship, () => useService(DRONE));
    expect(built).toBeGreaterThan(0);
    unmount();
  });

  it('checks the module that replaced { module } under overrideModule', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Navigation = defineModule({
      name: 'Navigation',
      providers: [provide(NAV_CHARTS, { useValue: fakeCharts })],
    });
    const NavigationStub = defineModule({
      name: 'NavigationStub',
      providers: [
        provide(NAV_CHARTS, {
          useFactory: () => fakeCharts,
          lifetime: 'transient',
        }),
      ],
    });
    const Meridian = defineModule({ name: 'Meridian', imports: [Navigation] });
    await using ship = await createTestingContainer(Meridian)
      .overrideModule(Navigation, NavigationStub)
      .create({ plugins: [react()] });
    expect(
      thrown(() =>
        hook(ship, () => useService(NAV_CHARTS, { module: Navigation })),
      ),
    ).toBeInstanceOf(TransientInRenderError);
  });

  it('sees a transient contribution a later load() adds', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create(
      [provide(DIAGNOSTICS, { useValue: { system: 'reactor' } })],
      { plugins: [react()] },
    );
    const first = hook(ship, () => useService(DIAGNOSTICS));
    first.unmount();
    await ship.load(
      defineModule({
        name: 'Hull',
        providers: [
          provide(DIAGNOSTICS, {
            useFactory: () => ({ system: 'hull' }),
            lifetime: 'transient',
          }),
        ],
        exports: [DIAGNOSTICS],
      }),
    );
    expect(
      thrown(() => hook(ship, () => useService(DIAGNOSTICS))),
    ).toBeInstanceOf(TransientInRenderError);
  });

  it('rejects a transient token under a scope too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create(
      [provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' })],
      { plugins: [react()] },
    );
    await using scope = await ship.createScope();
    expect(
      thrown(() => hook(ship, () => useService(DRONE), scope)),
    ).toBeInstanceOf(TransientInRenderError);
    expect(built).toBe(0);
  });

  it('is not part of devtools()', async () => {
    await using ship = await Nexus.create(
      [provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' })],
      { plugins: [devtools()] },
    );
    const { unmount } = hook(ship, () => useService(DRONE));
    expect(built).toBeGreaterThan(0);
    unmount();
  });
});
