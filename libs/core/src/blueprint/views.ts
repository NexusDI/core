import type {
  ModuleDefinition,
  ProviderEntry,
} from '../definitions/define-module.js';
import type { AnyToken } from '../definitions/guards.js';
import type { Class, Lifetime } from '../definitions/types.js';
import type { BlueprintError } from '../errors/index.js';
import type {
  Blueprint,
  Edge,
  ModuleNode,
  ProviderRecord,
  TokenKey,
} from './blueprint.js';

/** What a compile hook, a check hook or an error formatter reads. Frozen. */
export interface BlueprintView {
  readonly phase: 'create' | 'load' | 'check';
  /** False when a compile pass reported an error; the view holds what the passes finished. */
  readonly complete: boolean;
  /** The root module's id. Root get(), has(), resolve(), validate() and every scope look tokens up in this module. */
  readonly root: string;
  readonly modules: readonly ModuleView[];
  readonly providers: readonly ProviderView[];
  readonly edges: readonly EdgeView[];
  /** Provider ids of `token` visible in the module, in lookup order. The token is keyed through the tokenKey hooks, as get() keys it. */
  visible(moduleId: string, token: AnyToken): readonly string[];
  /** The key's canonical token for `token`: the one ProviderView.token holds. `token` itself without a tokenKey plugin. */
  canonical(token: AnyToken): AnyToken;
}

export interface ModuleView {
  readonly id: string;
  readonly name: string;
  readonly global: boolean;
  readonly imports: readonly string[];
  /** Provider ids and module ids. */
  readonly exports: readonly string[];
  readonly definition: ModuleDefinition;
  /** The definition a compile.module hook replaced, or null. */
  readonly replaced: ModuleDefinition | null;
}

export interface ProviderView {
  readonly id: string;
  /** The key's canonical token (spec §3.10.3). Compare it to find a provider; read `written` for what a token carries. */
  readonly token: AnyToken;
  /** The token the module listed, before a tokenKey hook keyed it. `token` itself without a tokenKey plugin. A compile.provider rewrite keeps it. */
  readonly written: AnyToken;
  /** The display name. */
  readonly name: string;
  /** The owning module's id. */
  readonly module: string;
  readonly kind: 'class' | 'value' | 'factory' | 'alias';
  readonly lifetime: Lifetime | null;
  readonly eager: boolean;
  /** The class a class provider constructs, or null. */
  readonly implementation: Class | null;
  /** The plugin whose compile.provider hook rewrote this provider, or null. */
  readonly rewrittenBy: string | null;
}

export interface EdgeView {
  readonly from: string;
  readonly to: string;
  readonly kind: 'required' | 'optional' | 'lazy' | 'all' | 'alias';
  /** The token the dependent named (an alias: its target), before a tokenKey hook keyed it. `canonical(written)` is the target provider's `token`. */
  readonly written: AnyToken;
}

export interface CompileContext {
  readonly phase: 'create' | 'load' | 'check';
  /** The definition a forRoot or forRootAsync instance was made from. */
  configuredFrom(module: ModuleDefinition): ModuleDefinition | undefined;
  /** The key's canonical token for `token`: the one ProviderView.token holds. `token` itself without a tokenKey plugin. */
  canonical(token: AnyToken): AnyToken;
}

export type ProviderRewrite =
  | {
      readonly with: ProviderEntry;
      readonly pin?: true;
      /** Names the rewriter in the entry's errors: `<label>(<provider name>)`. Defaults to the plugin name. */
      readonly label?: string;
    }
  | { readonly remove: true };

/** What buildView reads: a compile's passes, finished or not. */
export interface ViewParts {
  readonly phase: BlueprintView['phase'];
  readonly complete: boolean;
  /** The root module's id. */
  readonly root: string;
  readonly modules: readonly ModuleNode[];
  readonly records: Iterable<ProviderRecord>;
  readonly visibility: ReadonlyMap<
    string,
    ReadonlyMap<TokenKey, readonly string[]>
  >;
  readonly moduleExports: ReadonlyMap<string, readonly string[]>;
  readonly edges: readonly Edge[];
  /** Replacement → the definition a compile.module hook replaced. */
  readonly replaced: ReadonlyMap<ModuleDefinition, ModuleDefinition>;
  /** Provider id → the plugin whose compile.provider hook rewrote it. */
  readonly rewrittenBy: ReadonlyMap<string, string>;
}

/** Maps a token to the key the visibility map uses. */
export type Canonicalizer = (token: AnyToken) => TokenKey;

/** The canonicalizer of a container with no tokenKey hook: every token is its own key. */
export const sameToken: Canonicalizer = (token) => token;

export function providerView(
  record: ProviderRecord,
  rewrittenBy: string | null,
): ProviderView {
  return Object.freeze({
    id: record.id,
    token: record.token,
    written: record.written ?? record.token,
    name: record.name,
    module: record.module,
    kind: record.kind,
    lifetime: record.lifetime,
    eager: record.eager,
    implementation: record.kind === 'class' ? (record.useClass ?? null) : null,
    rewrittenBy,
  });
}

/**
 * A frozen view of `parts`. `visible()` looks its token up under
 * `canon(token)`, the key every lookup of the container uses, and
 * `canonical()` is `canon` itself.
 */
export function buildView(
  parts: ViewParts,
  canon: Canonicalizer,
): BlueprintView {
  const modules = Object.freeze(
    parts.modules.map((m) =>
      Object.freeze({
        id: m.id,
        name: m.name,
        global: m.global,
        imports: Object.freeze([...m.imports]),
        exports: Object.freeze([...(parts.moduleExports.get(m.id) ?? [])]),
        definition: m.definition,
        replaced: parts.replaced.get(m.definition) ?? null,
      }),
    ),
  );
  const providers = Object.freeze(
    [...parts.records].map((r) =>
      providerView(r, parts.rewrittenBy.get(r.id) ?? null),
    ),
  );
  const edges = Object.freeze(
    parts.edges.map((e) =>
      Object.freeze({
        from: e.from,
        to: e.to,
        kind: e.kind,
        written: e.written,
      }),
    ),
  );
  const visibility = parts.visibility;
  return Object.freeze({
    phase: parts.phase,
    complete: parts.complete,
    root: parts.root,
    modules,
    providers,
    edges,
    visible: (moduleId: string, token: AnyToken) =>
      Object.freeze([...(visibility.get(moduleId)?.get(canon(token)) ?? [])]),
    canonical: canon,
  });
}

const VIEWS = new WeakMap<Blueprint, BlueprintView>();
const FAILED = new WeakMap<BlueprintError, BlueprintView>();

/**
 * The view of a compiled blueprint: one frozen object per blueprint, built on
 * the first call. `canon` is the canonicalizer the blueprint compiled with.
 */
export function viewOfBlueprint(
  bp: Blueprint,
  canon: Canonicalizer,
): BlueprintView {
  let view = VIEWS.get(bp);
  if (view === undefined) {
    view = buildView(
      {
        phase: bp.phase,
        complete: true,
        root: bp.root,
        modules: [...bp.modules.values()],
        records: bp.providers.values(),
        visibility: bp.visibility,
        moduleExports: bp.moduleExports,
        edges: bp.edges,
        replaced: bp.replacedModules,
        rewrittenBy: bp.rewrittenBy,
      },
      canon,
    );
    VIEWS.set(bp, view);
  }
  return view;
}

/** Keeps the view of the compile that threw `error`, for failedView(). */
export function rememberFailedView(
  error: BlueprintError,
  view: BlueprintView,
): void {
  FAILED.set(error, view);
}

/** The view of the compile that threw `error`, when a plugin asked for one. */
export function failedView(error: BlueprintError): BlueprintView | undefined {
  return FAILED.get(error);
}
