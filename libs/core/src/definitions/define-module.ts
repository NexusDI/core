import { InvalidModuleError } from '../errors/index.js';
import { brand, isForeign } from './brand.js';
import { describeValue } from './describe.js';
import type { Dep, ResolveAll } from './modifiers.js';
import { pickOwn } from './own-keys.js';
import type { Provider } from './provide.js';
import type { ProviderEntries, ProviderLiteral } from './provider-literal.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import type { InjectionToken, MultiToken, Token } from './token.js';
import type { Class } from './types.js';

/** A module definition, or a class decorated with @Module. */
export type ModuleRef = ModuleDefinition | Class;

/** A provide() result, a bare class or a provider literal. */
export type ProviderEntry = Provider<unknown> | Class | ProviderLiteral;

/** A token the module provides or sees, or a module it imports. */
export type ExportEntry =
  InjectionToken<unknown> | MultiToken<unknown> | ModuleRef;

export interface ModuleConfig {
  readonly name: string;
  readonly imports?: readonly ModuleRef[];
  readonly providers?: readonly ProviderEntry[];
  readonly exports?: readonly ExportEntry[];
  readonly global?: boolean;
}

export interface ConfigurableModuleConfig<Opts> extends ModuleConfig {
  readonly options: Token<Opts>;
  readonly schema?: StandardSchemaV1<unknown, Opts>;
}

/** A frozen module. The compiler walks these. */
export interface ModuleDefinition {
  readonly name: string;
  readonly imports: readonly ModuleRef[];
  readonly providers: readonly ProviderEntry[];
  readonly exports: readonly ExportEntry[];
  readonly global: boolean;
}

/** What forRootAsync() takes: a factory for the options, and its deps. */
export interface ForRootAsyncConfig<Opts, D extends readonly Dep[]> {
  readonly useFactory: (
    ...args: ResolveAll<D>
  ) => NoInfer<Opts> | PromiseLike<NoInfer<Opts>>;
  readonly deps?: D;
}

/** A module that takes options, named as in NestJS. */
export interface ConfigurableModule<Opts> extends ModuleDefinition {
  readonly options: Token<Opts>;
  readonly schema: StandardSchemaV1<unknown, Opts> | undefined;
  forRoot(options: NoInfer<Opts>): ModuleDefinition;
  forRootAsync<const D extends readonly Dep[] = []>(
    config: ForRootAsyncConfig<Opts, D>,
  ): ModuleDefinition;
}

/**
 * How a forRoot() or forRootAsync() instance supplies its options. The
 * factory fields hold what the caller passed; the compiler checks them.
 */
export type OptionsSource =
  | { readonly kind: 'value'; readonly value: unknown }
  | {
      readonly kind: 'factory';
      readonly deps: unknown;
      readonly useFactory: unknown;
    };

/** What the compiler needs to know about a module beyond its public fields. */
export interface ModuleInternals {
  /** The definition forRoot() or forRootAsync() was called on, or the module itself. */
  readonly base: ModuleDefinition;
  readonly options: Token<unknown> | undefined;
  readonly schema: StandardSchemaV1 | undefined;
  /** Set on a forRoot() or forRootAsync() instance only. */
  readonly source: OptionsSource | undefined;
}

/** The keys a module config reads, as own properties only (SEC-003). */
const CONFIG_KEYS = [
  'name',
  'imports',
  'providers',
  'exports',
  'global',
  'options',
  'schema',
] as const;

const INTERNALS = new WeakMap<object, ModuleInternals>();
const CLASSES = new WeakMap<object, ModuleDefinition>();

function fieldsOf(config: ModuleConfig): ModuleDefinition {
  return {
    name: config.name,
    imports: Object.freeze([...(config.imports ?? [])]),
    providers: Object.freeze([...(config.providers ?? [])]),
    exports: Object.freeze([...(config.exports ?? [])]),
    global: config.global ?? false,
  };
}

function register<D extends ModuleDefinition>(
  definition: D,
  internals: Omit<ModuleInternals, 'base'> & {
    readonly base?: ModuleDefinition;
  },
): D {
  Object.freeze(brand(definition));
  INTERNALS.set(definition, {
    ...internals,
    base: internals.base ?? definition,
  });
  return definition;
}

/**
 * One signature: with overloads, TypeScript reports "No overload matches
 * this call" and lists every overload's error, which buries the element that
 * broke a rule. `Opts` comes from the options token; without one it stays
 * `never` and the result is a plain `ModuleDefinition`.
 */
export function defineModule<
  Opts = never,
  const P extends readonly unknown[] = [],
>(
  config: Omit<ModuleConfig, 'providers'> & {
    readonly providers?: ProviderEntries<P>;
    readonly options?: Token<Opts>;
    readonly schema?: StandardSchemaV1<unknown, NoInfer<Opts>>;
  },
): [Opts] extends [never] ? ModuleDefinition : ConfigurableModule<Opts>;
export function defineModule(
  config: ModuleConfig & {
    readonly options?: Token<unknown>;
    readonly schema?: StandardSchemaV1;
  },
): ModuleDefinition {
  const own =
    typeof config === 'object' && config !== null
      ? (pickOwn(config, CONFIG_KEYS) as Partial<typeof config>)
      : undefined;
  if (own === undefined || typeof own.name !== 'string' || own.name === '') {
    const received = describeValue(config);
    // Raised before any container exists, so core keeps its text (spec §9).
    throw new InvalidModuleError(
      { received, path: [], otherCopy: isForeign(config) },
      {
        text: `${received} is not a module.\n  Fix: create one with defineModule(), or decorate a class with @Module.`,
      },
    );
  }
  const { options, schema } = own;
  if (options === undefined) {
    return register(fieldsOf(own as ModuleConfig), {
      options: undefined,
      schema: undefined,
      source: undefined,
    });
  }
  const instance = (source: OptionsSource): ModuleDefinition =>
    register(fieldsOf(base), { base, options, schema, source });
  const base: ConfigurableModule<unknown> = {
    ...fieldsOf(own as ModuleConfig),
    options,
    schema,
    forRoot: (value: unknown) => instance({ kind: 'value', value }),
    forRootAsync: (config: unknown) => {
      // Own properties only, as the module config reads (SEC-002).
      const fields: { useFactory?: unknown; deps?: unknown } =
        typeof config === 'object' && config !== null
          ? pickOwn(config, ['useFactory', 'deps'])
          : {};
      return instance({
        kind: 'factory',
        deps: fields.deps ?? [],
        useFactory: fields.useFactory,
      });
    },
  };
  return register(base, { options, schema, source: undefined });
}

/** The compiler's view of a module, or undefined for a value defineModule did not return. */
export function moduleInternals(
  definition: ModuleDefinition,
): ModuleInternals | undefined {
  return INTERNALS.get(definition);
}

/** Makes `cls` a ModuleRef for `config`, and returns it. */
export function declareModuleClass<C extends Class>(
  cls: C,
  config: ModuleConfig,
): C {
  CLASSES.set(cls, defineModule(config as never));
  return brand(cls);
}

/** The definition behind a ModuleRef, or undefined when the value is not a module. */
export function resolveModuleRef(value: unknown): ModuleDefinition | undefined {
  if (typeof value === 'function') return CLASSES.get(value);
  if (typeof value === 'object' && value !== null && INTERNALS.has(value))
    return value as ModuleDefinition;
  return undefined;
}
