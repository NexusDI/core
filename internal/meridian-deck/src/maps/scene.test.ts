import { defineModule, provide, Token } from '@nexusdi/core';
import type { Nexus, Scope } from '@nexusdi/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DECK_STATE } from '../state/tokens.js';
import { app, mapOf } from './test-support.js';

import type { ISceneHook, SceneContext } from './contracts.js';
import { SCENE, SCENE_RUNNER, ScriptedDeckSource } from './index.js';

const cleanup: (Scope | Nexus)[] = [];
afterEach(async () => {
  for (const item of cleanup.splice(0).reverse()) {
    await item[Symbol.asyncDispose]();
  }
  vi.restoreAllMocks();
});

const SCENE_HOOK = new Token<Disposable>('DrillSceneHook');

/** A scene module whose hook records what it hears. */
function sceneModule(calls: string[], hook: Partial<ISceneHook> = {}) {
  return defineModule({
    name: 'DrillScene',
    providers: [
      provide(SCENE_HOOK, {
        useFactory: (runner) => {
          const attached: ISceneHook = {
            onEnter: (context) => {
              calls.push(`enter:${context.map.id}`);
              return hook.onEnter?.(context);
            },
            onEvent: (event) => {
              calls.push(`event:${event.type}`);
            },
            onExit: () => {
              calls.push('exit');
            },
          };
          const detach = runner.attach('drill', attached);
          return { [Symbol.dispose]: detach };
        },
        deps: [SCENE_RUNNER],
        lifetime: 'singleton',
      }),
    ],
  });
}

async function drill(calls: string[], hook: Partial<ISceneHook> = {}) {
  const module = sceneModule(calls, hook);
  const loader = vi.fn(async () => module);
  const harness = await app({
    maps: { 'test-map': mapOf({ scene: 'drill' }) },
    scenes: { drill: loader },
  });
  cleanup.push(harness.nexus);
  return { ...harness, loader };
}

describe('the scene runner', () => {
  it('loads the scene module after the scope opens, attaches its hook and extends the scope', async () => {
    const calls: string[] = [];
    const { open, nexus, BayDeckState, BayDeckMaps, runner, loader } =
      await drill(calls);
    const scope = await open('test-map');
    cleanup.push(scope);
    expect(loader).not.toHaveBeenCalled();
    await runner.open(nexus, scope, { imports: [BayDeckState, BayDeckMaps] });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['enter:test-map']);
    expect(scope.get(SCENE).map.scene).toBe('drill');
  });

  it('refuses a read of a scene token until the scope extends, and allows it after', async () => {
    const sceneToken = new Token<string>('DrillOnly');
    const Drill = defineModule({
      name: 'DrillScene',
      providers: [
        provide(sceneToken, {
          useFactory: () => 'drill-only',
          lifetime: 'scoped',
        }),
      ],
      exports: [sceneToken],
    });
    const harness = await app({
      maps: { 'test-map': mapOf({ scene: 'drill' }) },
      scenes: { drill: async () => Drill },
    });
    cleanup.push(harness.nexus);
    const scope = await harness.open('test-map');
    cleanup.push(scope);
    await harness.nexus.load(Drill, { imports: [harness.BayDeckState] });
    expect(() => scope.get(sceneToken)).toThrowError(
      expect.objectContaining({ code: 'NEXUS_LOADED_AFTER_SCOPE' }),
    );
    await scope.extend();
    expect(scope.get(sceneToken)).toBe('drill-only');
  });

  it('passes source events to the hook and calls onExit when the scope disposes', async () => {
    const calls: string[] = [];
    const { open, nexus, BayDeckState, BayDeckMaps, runner, source } =
      await drill(calls);
    const scope = await open('test-map');
    await runner.open(nexus, scope, { imports: [BayDeckState, BayDeckMaps] });
    source.push({ type: 'select', id: 'bridge' });
    await scope[Symbol.asyncDispose]();
    source.push({ type: 'select', id: 'bridge' });
    expect(calls).toEqual(['enter:test-map', 'event:select', 'exit']);
  });

  it('enters the hook of a scene already loaded when a later scope opens the map', async () => {
    const calls: string[] = [];
    const { open, nexus, BayDeckState, BayDeckMaps, runner, loader } =
      await drill(calls);
    const imports = [BayDeckState, BayDeckMaps];
    const first = await open('test-map');
    await runner.open(nexus, first, { imports });
    await first[Symbol.asyncDispose]();
    const second = await open('test-map');
    cleanup.push(second);
    await runner.open(nexus, second, { imports });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(['enter:test-map', 'exit', 'enter:test-map']);
  });

  it('lets the hook hold, release, move the camera and raise cues through its context, and releases its holds on exit', async () => {
    let context: SceneContext | undefined;
    const calls: string[] = [];
    const { open, nexus, BayDeckState, BayDeckMaps, runner, state } =
      await drill(calls, {
        onEnter: (given) => {
          context = given;
        },
      });
    const scope = await open('test-map');
    await runner.open(nexus, scope, { imports: [BayDeckState, BayDeckMaps] });
    context?.state.hold('lights', { rooms: { bridge: 'alarm' } });
    context?.camera.focus('bridge', 'room');
    context?.callout('bridge', { text: 'Look' });
    context?.announce('Heads up');
    expect(state.snapshot().rooms['bridge']).toBe('alarm');
    expect(state.heldBy('bridge')).toBe('test-map:scene:lights');
    expect(state.snapshot().camera).toEqual({ focus: 'bridge', zoom: 'room' });
    expect(scope.get(SCENE).cues()).toEqual([
      { kind: 'callout', at: 'bridge', text: 'Look' },
      { kind: 'announce', text: 'Heads up' },
    ]);
    context?.state.setCameraTarget({ focus: 'helm' });
    context?.state.release('lights');
    expect(state.snapshot().rooms['bridge']).toBeUndefined();
    context?.state.hold('again', { rooms: { bridge: 'alarm' } });
    await scope[Symbol.asyncDispose]();
    expect(state.snapshot().held).toEqual({});
  });

  it('waits for an async onEnter before open resolves', async () => {
    const calls: string[] = [];
    let settled = false;
    const { open, nexus, BayDeckState, BayDeckMaps, runner } = await drill(
      calls,
      {
        onEnter: async () => {
          await Promise.resolve();
          settled = true;
        },
      },
    );
    const scope = await open('test-map');
    cleanup.push(scope);
    await runner.open(nexus, scope, { imports: [BayDeckState, BayDeckMaps] });
    expect(settled).toBe(true);
  });

  it('loads nothing for a map with no scene, and warns for a scene the options lack', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plain = await app({ maps: { 'test-map': mapOf() } });
    cleanup.push(plain.nexus);
    const scope = await plain.open('test-map');
    cleanup.push(scope);
    await plain.runner.open(plain.nexus, scope, { imports: [] });
    expect(warn).not.toHaveBeenCalled();

    const missing = await app({
      maps: { 'test-map': mapOf({ scene: 'nowhere' }) },
    });
    cleanup.push(missing.nexus);
    const other = await missing.open('test-map');
    cleanup.push(other);
    await missing.runner.open(missing.nexus, other, { imports: [] });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nowhere'));
  });

  it('keeps the state store through DECK_STATE for the scene', async () => {
    const { nexus } = await drill([]);
    expect(nexus.get(DECK_STATE)).toBeDefined();
  });
});

describe('ScriptedDeckSource', () => {
  it('steps its events in order and reports when the script ends', () => {
    const source = new ScriptedDeckSource([
      { type: 'select', id: 'a' },
      { type: 'select', id: 'b' },
    ]);
    const heard: string[] = [];
    source.subscribe((event) => {
      if (event.type === 'select') heard.push(event.id);
    });
    expect(source.remaining).toBe(2);
    expect(source.step()).toBe(true);
    expect(source.step()).toBe(true);
    expect(source.step()).toBe(false);
    expect(heard).toEqual(['a', 'b']);
    expect(source.remaining).toBe(0);
  });

  it('gives a late subscriber the state so far as one state event', () => {
    const source = new ScriptedDeckSource([
      { type: 'state', patch: { rooms: { bridge: 'alarm' } } },
      { type: 'state', patch: { rooms: { habitat: 'unpowered' } } },
      {
        type: 'state',
        patch: { alarms: [{ code: 'FIRE', subject: 'bridge' }] },
      },
    ]);
    source.step();
    source.step();
    const heard: unknown[] = [];
    source.subscribe((event) => heard.push(event));
    expect(heard).toEqual([
      {
        type: 'state',
        patch: expect.objectContaining({
          rooms: { bridge: 'alarm', habitat: 'unpowered' },
        }),
      },
    ]);
    source.step();
    expect(heard).toHaveLength(2);
  });

  it('says nothing to a subscriber when no state has been sent', () => {
    const source = new ScriptedDeckSource([{ type: 'select', id: 'a' }]);
    const heard: unknown[] = [];
    source.subscribe((event) => heard.push(event));
    expect(heard).toEqual([]);
  });

  it('drives a map’s triggers through the store', async () => {
    const source = new ScriptedDeckSource([
      { type: 'reading', reading: { ftl: { status: 'charged' } } },
    ]);
    const harness = await app(
      {
        maps: {
          'test-map': mapOf({
            triggers: [
              {
                id: 'go',
                when: { record: 'ftl.status', is: 'charged' },
                then: [{ room: 'ftl-core', light: 'powered' }],
              },
            ],
          }),
        },
      },
      source,
    );
    cleanup.push(harness.nexus);
    cleanup.push(await harness.open('test-map'));
    source.step();
    expect(harness.state.snapshot().rooms['ftl-core']).toBe('powered');
  });
});
