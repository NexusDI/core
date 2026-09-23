import { compile } from '../blueprint/compile.js';
import type { ModuleRef } from '../definitions/define-module.js';
import type { InjectionToken, MultiToken } from '../definitions/token.js';
import { getFrom, hasIn } from './lookup.js';
import type { CreateOptions, LookupOptions } from './options.js';
import { startBlueprint } from './startup.js';
import { assertOpen, createRootState, type RootState } from './state.js';
import { Tracer } from './trace.js';

/** Settings the testing entry sets; Nexus.create uses the defaults. */
export interface ContainerInternals {
  readonly initEnabled: boolean;
}

let wrap: (state: RootState) => Nexus;

/**
 * A compiled, sealed container. Create one with `await Nexus.create(Root)`.
 * `get()` and `has()` are synchronous; async work happens only in `create`,
 * `load` and `createScope`.
 */
export class Nexus {
  readonly #state: RootState;

  static {
    wrap = (state) => new Nexus(state);
  }

  private constructor(state: RootState) {
    this.#state = state;
  }

  /** Compiles the module graph, builds every singleton, and returns the sealed container. */
  static create(root: ModuleRef, options?: CreateOptions): Promise<Nexus> {
    return createContainer(root, options, { initEnabled: true });
  }

  get<T>(token: MultiToken<T>, options?: LookupOptions): T[];
  get<T>(token: InjectionToken<T>, options?: LookupOptions): T;
  get(token: unknown, options?: LookupOptions): unknown {
    assertOpen(this.#state);
    return getFrom(
      this.#state,
      this.#state.blueprint,
      token,
      options,
      'root-transient',
    );
  }

  has(
    token: InjectionToken<unknown> | MultiToken<unknown>,
    options?: LookupOptions,
  ): boolean {
    assertOpen(this.#state);
    return hasIn(this.#state.blueprint, token, options);
  }
}

export async function createContainer(
  root: unknown,
  options: CreateOptions | undefined,
  internals: ContainerInternals,
): Promise<Nexus> {
  const tracer = new Tracer(options?.trace);
  const blueprint = compile({ root });
  const state = createRootState({
    blueprint,
    rootRef: root,
    tracer,
    initEnabled: internals.initEnabled,
  });
  await startBlueprint(state, { bp: blueprint, isNew: () => true });
  return wrap(state);
}
