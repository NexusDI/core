import { loadOnce } from '@nexusdi/core';
import type { LoadOptions, Nexus, Scope } from '@nexusdi/core';

import type { DeckEvent } from '../state/contracts.js';
import { inDevelopment } from './dev.js';

import type {
  DeckMapsOptions,
  ISceneHook,
  ISceneRunner,
  SceneBinding,
} from './contracts.js';
import { DECK_MAPS_OPTIONS, SCENE } from './tokens.js';

/**
 * Holds the scene hooks that scene modules attach and the maps that are open,
 * and pairs them by scene id. `open` loads the scene module a map names.
 */
export class SceneRunner implements ISceneRunner {
  static deps = [DECK_MAPS_OPTIONS] as const;

  private readonly hooks = new Set<{ sceneId: string; hook: ISceneHook }>();
  private readonly bindings = new Set<SceneBinding>();
  private readonly pending: Promise<void>[] = [];

  constructor(private readonly options: DeckMapsOptions) {}

  attach(sceneId: string, hook: ISceneHook): () => void {
    const entry = { sceneId, hook };
    this.hooks.add(entry);
    for (const binding of this.bindings) {
      if (binding.sceneId === sceneId) this.enter(hook, binding);
    }
    return () => {
      if (!this.hooks.delete(entry)) return;
      for (const binding of this.bindings) {
        if (binding.sceneId === sceneId) hook.onExit?.();
      }
    };
  }

  register(binding: SceneBinding): () => void {
    this.bindings.add(binding);
    for (const { sceneId, hook } of this.hooks) {
      if (binding.sceneId === sceneId) this.enter(hook, binding);
    }
    return () => {
      if (!this.bindings.delete(binding)) return;
      for (const { sceneId, hook } of this.hooks) {
        if (binding.sceneId === sceneId) hook.onExit?.();
      }
    };
  }

  dispatch(binding: SceneBinding, event: DeckEvent): void {
    for (const { sceneId, hook } of this.hooks) {
      if (binding.sceneId === sceneId) hook.onEvent?.(event, binding.context);
    }
  }

  async open(
    nexus: Nexus,
    scope: Scope,
    options: Pick<LoadOptions, 'imports'>,
  ): Promise<void> {
    const sceneId = scope.get(SCENE).map.scene;
    if (sceneId === null) return;
    const load = this.options.scenes?.[sceneId];
    if (load === undefined) {
      if (inDevelopment()) {
        console.warn(
          `The map names the scene "${sceneId}", which the DeckMaps options do not list, so no scene loads.`,
        );
      }
      return;
    }
    await loadOnce(nexus)(await load(), options);
    await scope.extend();
    await Promise.all(this.pending.splice(0));
  }

  private enter(hook: ISceneHook, binding: SceneBinding): void {
    const result = hook.onEnter?.(binding.context);
    if (result !== undefined) this.pending.push(Promise.resolve(result));
  }
}
