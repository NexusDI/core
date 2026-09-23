import { InvalidModuleError } from '../errors/index.js';
import { describeValue } from './describe.js';
import type { Dep, ResolveAll } from './modifiers.js';
import type { Provider } from './provide.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import type { InjectionToken, MultiToken, Token } from './token.js';
import type { Class } from './types.js';

/** A module definition, or a class decorated with @Module. */
export type ModuleRef = ModuleDefinition | Class;

/** A provider() result, or a bare class. */
export type ProviderEntry = Provider<unknown> | Class;

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

export interface OptionsFactory<Opts, D extends readonly Dep[]> {
  readonly deps: D;
  readonly useFactory: (...args: ResolveAll<D>) => Opts | PromiseLike<Opts>;
}

/** A module that takes options through with(). */
export interface ConfigurableModule<Opts> extends ModuleDefinition {
  readonly options: Token<Opts>;
  readonly schema: StandardSchemaV1<unknown, Opts> | undefined;
  with<const D extends readonly Dep[]>(
    factory: OptionsFactory<Opts, D>,
  ): ModuleDefinition;
  with(value: Opts): ModuleDefinition;
}

/** How a with() instance supplies its options. */
export type OptionsSource =
  | { readonly kind: 'value'; readonly value: unknown }
  | {
      readonly kind: 'factory';
      readonly deps: readonly unknown[];
      readonly useFactory: (...args: unknown[]) => unknown;
    };

/** What the compiler needs to know about a module beyond its public fields. */
export interface ModuleInternals {
  /** The definition with() was called on, or the module itself. */
  readonly base: ModuleDefinition;
  readonly options: Token<unknown> | undefined;
  readonly schema: StandardSchemaV1 | undefined;
  /** Set on a with() instance only. */
  readonly source: OptionsSource | undefined;
}

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
  Object.freeze(definition);
  INTERNALS.set(definition, {
    ...internals,
    base: internals.base ?? definition,
  });
  return definition;
}

function sourceOf(input: unknown): OptionsSource {
  const candidate = input as { deps?: unknown; useFactory?: unknown } | null;
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.useFactory === 'function' &&
    Array.isArray(candidate.deps)
  ) {
    return {
      kind: 'factory',
      deps: candidate.deps,
      useFactory: candidate.useFactory as (...args: unknown[]) => unknown,
    };
  }
  return { kind: 'value', value: input };
}

export function defineModule<Opts>(
  config: ConfigurableModuleConfig<Opts>,
): ConfigurableModule<Opts>;
export function defineModule(config: ModuleConfig): ModuleDefinition;
export function defineModule(
  config: ModuleConfig & {
    readonly options?: Token<unknown>;
    readonly schema?: StandardSchemaV1;
  },
): ModuleDefinition {
  if (
    typeof config !== 'object' ||
    config === null ||
    typeof config.name !== 'string' ||
    config.name === ''
  ) {
    throw new InvalidModuleError({
      received: describeValue(config),
      path: [],
    });
  }
  const { options, schema } = config;
  if (options === undefined) {
    return register(fieldsOf(config), {
      options: undefined,
      schema: undefined,
      source: undefined,
    });
  }
  const base: ConfigurableModule<unknown> = {
    ...fieldsOf(config),
    options,
    schema,
    with: (input: unknown): ModuleDefinition =>
      register(fieldsOf(base), {
        base,
        options,
        schema,
        source: sourceOf(input),
      }),
  };
  return register(base, { options, schema, source: undefined });
}

/** The compiler's view of a module, or undefined for a value defineModule did not return. */
export function moduleInternals(
  definition: ModuleDefinition,
): ModuleInternals | undefined {
  return INTERNALS.get(definition);
}

/** Records the definition an @Module class stands for. */
export function registerModuleClass(
  cls: Class,
  definition: ModuleDefinition,
): void {
  CLASSES.set(cls, definition);
}

/** The definition behind a ModuleRef, or undefined when the value is not a module. */
export function resolveModuleRef(value: unknown): ModuleDefinition | undefined {
  if (typeof value === 'function') return CLASSES.get(value);
  if (typeof value === 'object' && value !== null && INTERNALS.has(value))
    return value as ModuleDefinition;
  return undefined;
}
