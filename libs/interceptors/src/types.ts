import type {
  Ctor,
  InjectionToken,
  ModuleRef,
  MultiToken,
  Provider,
  ProviderEntry,
  ProviderView,
} from '@nexusdi/core';

/** What an interceptor receives for one call. */
export interface CallContext {
  /** The raw instance; `this` inside the method. */
  readonly instance: object;
  /** The provider that built the instance. */
  readonly provider: ProviderView;
  readonly method: string | symbol;
  /** The arguments this interceptor received. */
  readonly args: readonly unknown[];
  /** The method is declared async. */
  readonly async: boolean;
  /** The id of the scope that built the instance, or null for the root. */
  readonly scope: string | null;
}

/** Runs the rest of the chain and the method. `args` replaces the arguments. */
export type Next = (args?: readonly unknown[]) => unknown;

/** A method interceptor. Registered in interceptors({ register }). */
export interface Interceptor {
  intercept(call: CallContext, next: Next): unknown;
}

export type InterceptorToken = InjectionToken<Interceptor>;

/** The method names of T; any string or symbol when T is unknown. */
export type MethodKey<T> = unknown extends T
  ? string | symbol
  : Extract<
      {
        [K in keyof T]-?: T[K] extends (...args: never[]) => unknown
          ? K
          : never;
      }[keyof T],
      string | symbol
    >;

/** The shape of `static interceptors` and of a binding. */
export type InterceptorMap<T = unknown> = {
  readonly class?: readonly InterceptorToken[];
  readonly methods?: {
    readonly [K in MethodKey<T>]?: readonly InterceptorToken[];
  };
};

export interface GlobalTarget {
  readonly provider: ProviderView;
  readonly method: string | symbol;
}

export interface GlobalEntry {
  readonly use: InterceptorToken;
  /** Called once per provider and method; false skips the interceptor there. */
  readonly when?: (target: GlobalTarget) => boolean;
}

/** Interceptors for a token whose provider the app cannot edit, or a factory. */
export type InterceptorBinding = InterceptorMap & {
  readonly token: InjectionToken<unknown>;
};

/** A class that implements Interceptor; it is its own token. */
export type InterceptorClass = Ctor &
  (abstract new (...args: never) => Interceptor);

/** An interceptor bound to a token by interceptor(). */
export interface InterceptorEntry {
  readonly token: InterceptorToken;
  /**
   * The interceptor's provider. Unset when interceptor() rejected the
   * token: the entry then only carries that fault, which the plugin's
   * compile.check reports for the options that register it.
   */
  readonly provider: Provider<Interceptor> | undefined;
}

/** A token `exempt` takes: an injection token, or a multi token for `all()` deps. */
export type ExemptToken = InjectionToken<unknown> | MultiToken<unknown>;

export interface InterceptorsOptions {
  /** The interceptors: classes, or interceptor(TOKEN, definition) entries. */
  readonly register: readonly (InterceptorClass | InterceptorEntry)[];
  /** Other providers the interceptors depend on, private to the plugin's module. */
  readonly providers?: readonly ProviderEntry[];
  /** Modules the interceptors' deps come from. */
  readonly imports?: readonly ModuleRef[];
  /** Interceptors for every intercepted method, outermost first. */
  readonly global?: readonly (InterceptorToken | GlobalEntry)[];
  readonly bindings?: readonly InterceptorBinding[];
  /**
   * The services outside `providers` that the interceptors depend on.
   * With `global` entries, each must be listed: global entries skip it and
   * every provider it reaches, so an interceptor never intercepts a service
   * it calls. `create` names each one missing.
   */
  readonly exempt?: readonly ExemptToken[];
}
