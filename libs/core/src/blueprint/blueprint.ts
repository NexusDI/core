import type { ModuleDefinition } from '../definitions/define-module.js';
import type { AnyToken } from '../definitions/guards.js';
import type { StandardSchemaV1 } from '../definitions/standard-schema.js';
import type { Ctor, Lifetime } from '../definitions/types.js';

/** The id of the built-in REQUEST provider. Every other provider id is `p<n>`. */
export const REQUEST_ID = 'request';

/**
 * The one empty map compiles share where a map has no entries, so a compile
 * with no plugin allocates nothing for hooks (spec D19). Nothing writes to it.
 */
export const NO_ENTRIES: ReadonlyMap<never, never> = new Map<never, never>();

export type TokenKey = AnyToken;
export type ProviderKind = 'class' | 'value' | 'factory' | 'alias';
export type DepKind = 'required' | 'optional' | 'lazy' | 'all';
export type EdgeKind = DepKind | 'alias';

export interface DepEntry {
  readonly kind: DepKind;
  readonly token: TokenKey;
}

/** One @Inject accessor. `set` writes through the decorator's own accessor. */
export interface PropEntry {
  readonly key: string | symbol;
  readonly dep: DepEntry;
  readonly set: (target: object, value: unknown) => void;
}

/** A provider after validation, before the walk gives it an id. */
export interface RecordShape {
  readonly kind: ProviderKind;
  readonly token: TokenKey;
  /** null for value and alias providers. */
  readonly lifetime: Lifetime | null;
  /**
   * False when the provider builds at its first request (spec §6.6). True
   * for value and alias providers, transients and REQUEST.
   */
  readonly eager: boolean;
  /** Constructor or factory arguments, in order. */
  readonly deps: readonly DepEntry[];
  readonly props: readonly PropEntry[];
  /** useExisting only. */
  readonly target?: TokenKey;
  readonly useClass?: Ctor;
  readonly useFactory?: (...args: unknown[]) => unknown;
  readonly value?: unknown;
  /** Set on a configurable module's options provider. */
  readonly schema?: StandardSchemaV1;
}

export interface ProviderRecord extends RecordShape {
  /** `p0`, `p1`, ... in walk order, then declaration order. */
  readonly id: string;
  readonly index: number;
  /** The owning module's id. */
  readonly module: string;
  /** The token's display name. */
  readonly name: string;
}

export interface ModuleNode {
  /** `m0`, `m1`, ... in walk order. `m0` is the root. */
  readonly id: string;
  readonly index: number;
  readonly name: string;
  readonly definition: ModuleDefinition;
  readonly global: boolean;
  readonly imports: readonly string[];
  readonly providers: readonly string[];
  /** The tokens the module's exports list names, in list order. */
  readonly exportTokens: readonly TokenKey[];
  /** The ids of the imported modules the module re-exports, in list order. */
  readonly exportModules: readonly string[];
}

/** What one deps entry or property bound to. */
export interface Binding {
  readonly kind: DepKind;
  readonly token: TokenKey;
  /** One id for required, lazy and a found optional; none for a missing optional; every contribution for all. */
  readonly ids: readonly string[];
}

export interface ProviderBindings {
  readonly args: readonly Binding[];
  readonly props: readonly Binding[];
  /** An alias's bound target. */
  readonly target: string | null;
}

export interface Edge {
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
}

/**
 * The compiled, frozen graph the runtime builds from. `load()` produces a new
 * Blueprint that contains the old one.
 */
export interface Blueprint {
  /** The root module's id, always `m0`. */
  readonly root: string;
  readonly modules: ReadonlyMap<string, ModuleNode>;
  /** The definitions the walk visited, replacements included, originals not. */
  readonly moduleByDefinition: ReadonlyMap<ModuleDefinition, string>;
  /**
   * A definition a compile.module hook replaced → the id of the module that
   * replaced it. @nexusdi/testing's overrideModule() is such a hook.
   */
  readonly moduleByReplaced: ReadonlyMap<ModuleDefinition, string>;
  readonly providers: ReadonlyMap<string, ProviderRecord>;
  /** Modules load() added as root imports, in load order. */
  readonly extraImports: readonly unknown[];
  /** module id → token → provider ids that module sees. */
  readonly visibility: ReadonlyMap<
    string,
    ReadonlyMap<TokenKey, readonly string[]>
  >;
  /** module id → provider ids and module ids it exports. */
  readonly moduleExports: ReadonlyMap<string, readonly string[]>;
  /** module id → tokens it exports, re-exports included. */
  readonly exportedTokens: ReadonlyMap<string, ReadonlySet<TokenKey>>;
  /** provider id → what its deps, properties and alias target bound to. */
  readonly bindings: ReadonlyMap<string, ProviderBindings>;
  readonly edges: readonly Edge[];
  /** Singleton provider ids, level by level, for create and load. */
  readonly singletonLevels: readonly (readonly string[])[];
  /**
   * The eager: false providers no level holds: those no eager provider
   * reaches, and a singleton the blueprint a load compiled against
   * deferred. The runtime builds each at its first request (spec §6.6). A
   * levelled eager: false provider builds as an eager one does.
   */
  readonly deferred: ReadonlySet<string>;
  /** Scoped factories and their scoped deps, level by level, for createScope. */
  readonly scopedLevels: readonly (readonly string[])[];
  /** True when any provider has a non-optional edge to REQUEST. */
  readonly needsRequest: boolean;
  /** Display names of the providers with a non-optional edge to REQUEST. */
  readonly requestDependents: readonly string[];
  /** The phase that compiled it. */
  readonly phase: 'create' | 'load' | 'check';
  /** Replacement → the module a compile.module hook replaced. */
  readonly replacedModules: ReadonlyMap<ModuleDefinition, ModuleDefinition>;
  /** Provider id → the plugin whose compile.provider hook rewrote it. */
  readonly rewrittenBy: ReadonlyMap<string, string>;
}
