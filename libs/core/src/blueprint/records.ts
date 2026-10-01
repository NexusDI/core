import { isForeign } from '../definitions/brand.js';
import {
  resolveModuleRef,
  type ModuleInternals,
} from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { isToken } from '../definitions/guards.js';
import {
  injectableIn,
  metadataOf,
  propsIn,
  type InjectableMetadata,
  type MetadataRecord,
} from '../definitions/metadata.js';
import { isModifier } from '../definitions/modifiers.js';
import { pickOwn } from '../definitions/own-keys.js';
import { readProvider } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { MultiToken, displayName } from '../definitions/token.js';
import type { Ctor, Lifetime } from '../definitions/types.js';
import {
  describeThrown,
  InvalidProviderError,
  InvalidTokenError,
  MissingDepsError,
  type InvalidProviderReason,
  type NexusError,
} from '../errors/index.js';
import type {
  DepEntry,
  PropEntry,
  ProviderRecord,
  RecordShape,
  TokenKey,
} from './blueprint.js';

const LIFETIMES: ReadonlySet<unknown> = new Set([
  'singleton',
  'scoped',
  'transient',
]);
const DEFINITION_KEYS = [
  'useClass',
  'useValue',
  'useFactory',
  'useExisting',
] as const;

/**
 * The keys a provider definition reads, as own properties only (SEC-003).
 * Pass 1 ignores every other key.
 */
const OPTION_KEYS = ['deps', 'lifetime', 'eager', ...DEFINITION_KEYS] as const;

type Options = { readonly [K in (typeof OPTION_KEYS)[number]]?: unknown };

/**
 * The deps a class declares with `static deps`: an own property of the
 * class, or of the nearest parent class that has one. The walk stops before
 * Function.prototype, so a key only a built-in prototype carries is never a
 * declaration (SEC-012). A subclass without its own static deps inherits its
 * parent's, as it inherits @Injectable deps (spec §3.2).
 */
function staticDepsOf(cls: Ctor): unknown {
  for (
    let c: unknown = cls;
    typeof c === 'function' && c !== Function.prototype;
    c = Object.getPrototypeOf(c)
  ) {
    if (Object.hasOwn(c, 'deps'))
      return (c as unknown as { readonly deps: unknown }).deps;
  }
  return undefined;
}

/**
 * The declared static deps, or null after reporting a getter that throws or
 * a static deps that is not an array.
 */
function readStaticDeps(cls: Ctor, at: At): unknown {
  let value: unknown;
  try {
    value = staticDepsOf(cls);
  } catch (error) {
    return fail(at, 'static-deps-throws', describeThrown(error));
  }
  if (value !== undefined && !Array.isArray(value))
    return fail(at, 'static-deps-not-array');
  return value;
}

/**
 * The deps a class form takes when it sets no deps option, or null after
 * reporting. Every form reads both its @Injectable deps and its static deps,
 * so the conflict check (both declared, own or inherited) runs for each. A
 * bare class and useClass: C take the @Injectable deps first; provide(C),
 * provide(C, { lifetime }) and a { token: C } literal take static deps only
 * (spec §3.2).
 */
function declaredDeps(
  cls: Ctor,
  injectable: InjectableMetadata | undefined,
  useMetadata: boolean,
  at: At,
): unknown {
  const fromMetadata =
    injectable !== undefined && Object.hasOwn(injectable, 'deps')
      ? injectable.deps
      : undefined;
  const fromStatic = readStaticDeps(cls, at);
  if (fromStatic === null) return null;
  if (fromMetadata !== undefined && fromStatic !== undefined)
    return fail(at, 'deps-in-both');
  return useMetadata ? (fromMetadata ?? fromStatic) : fromStatic;
}

/** True for a provider literal: an object that sets `token` on itself (spec §3.2). */
function isLiteral(value: unknown): value is { readonly token: unknown } {
  return (
    typeof value === 'object' && value !== null && Object.hasOwn(value, 'token')
  );
}

/** What a provide() result or a provider literal defines. */
interface Definition {
  readonly token: unknown;
  readonly options: Options | undefined;
}

function definitionOf(entry: unknown, at: At): Definition | null {
  const spec = readProvider(entry);
  if (spec !== undefined) {
    const { token, options } = spec;
    if (options === undefined) return { token, options: undefined };
    if (typeof options !== 'object' || options === null) {
      return fail(at, 'options-not-object', describeValue(options));
    }
    return { token, options: pickOwn(options, OPTION_KEYS) };
  }
  if (isLiteral(entry))
    return { token: entry.token, options: pickOwn(entry, OPTION_KEYS) };
  return report(at, isForeign(entry), 'not-a-provider', [describeValue(entry)]);
}

/**
 * The record of a shape. Every record has every key, in one order, so the
 * passes that read records see one object shape.
 */
export function providerRecord(
  shape: RecordShape,
  id: string,
  index: number,
  module: string,
  name: string,
): ProviderRecord {
  return {
    id,
    index,
    module,
    name,
    kind: shape.kind,
    token: shape.token,
    written: shape.written,
    lifetime: shape.lifetime,
    eager: shape.eager,
    deps: shape.deps,
    props: shape.props,
    target: shape.target,
    writtenTarget: shape.writtenTarget,
    useClass: shape.useClass,
    useFactory: shape.useFactory,
    value: shape.value,
    schema: shape.schema,
  };
}

/** Where a provider entry sits, for error messages. */
export interface ProviderSite {
  readonly module: string;
  readonly index: number;
}

/**
 * Where a providers entry sits and where its errors go. `prefix` leads every
 * detail, as `(the forRootAsync() factory)` does for the provider a
 * forRootAsync() instance adds.
 */
interface At {
  readonly site: ProviderSite;
  readonly errors: NexusError[];
  readonly prefix: readonly string[];
}

const NO_PREFIX: readonly string[] = [];

/**
 * Pushes the InvalidProviderError of a malformed entry: the reason id, then
 * the values its text names. `otherCopy` is true when another copy of core
 * made the rejected value. Returns null for the caller to return.
 */
function report(
  at: At,
  otherCopy: boolean,
  reason: InvalidProviderReason,
  detail: readonly string[],
): null {
  at.errors.push(
    new InvalidProviderError({
      module: at.site.module,
      index: at.site.index,
      reason,
      detail: [...at.prefix, ...detail],
      otherCopy,
    }),
  );
  return null;
}

/** report() for a value this copy of core made. */
function fail(
  at: At,
  reason: InvalidProviderReason,
  ...detail: string[]
): null {
  return report(at, false, reason, detail);
}

/** The InvalidTokenError of a providers entry whose token or alias target is not a token. */
function invalidToken(
  value: unknown,
  site: ProviderSite,
  reason: 'alias-target' | null,
): InvalidTokenError {
  return new InvalidTokenError({
    received: describeValue(value),
    entry: null,
    module: site.module,
    index: site.index,
    reason,
    detail: [],
    otherCopy: isForeign(value),
  });
}

/**
 * The token an entry names, even when the entry is malformed. The walk marks
 * it broken, so pass 3 does not report a missing provider for a token whose
 * provider already has an error. A literal whose `token` read throws names
 * none; normalizeProvider reports the throw.
 */
export function tokenOfEntry(entry: unknown): TokenKey | undefined {
  let candidate: unknown = entry;
  try {
    candidate =
      readProvider(entry)?.token ?? (isLiteral(entry) ? entry.token : entry);
  } catch {
    return undefined;
  }
  return isToken(candidate) ? candidate : undefined;
}

/** Why a value is not a dep, with the values the reason's text names. */
export interface BadDep {
  readonly reason: 'bad-modifier' | 'bare-multi-token' | 'not-a-token';
  readonly detail: readonly string[];
  /** True when another copy of core made the rejected value. */
  readonly otherCopy: boolean;
}

/** A dep, or why the value is not one. */
export function depOf(value: unknown): DepEntry | BadDep {
  if (isModifier(value)) {
    if (
      !isToken(value.token) ||
      value.token instanceof MultiToken !== (value.kind === 'all')
    ) {
      return {
        reason: 'bad-modifier',
        detail: [value.kind, describeValue(value.token)],
        otherCopy: isForeign(value.token),
      };
    }
    return { kind: value.kind, token: value.token };
  }
  if (value instanceof MultiToken)
    return {
      reason: 'bare-multi-token',
      detail: [value.description],
      otherCopy: false,
    };
  if (isToken(value)) return { kind: 'required', token: value };
  return {
    reason: 'not-a-token',
    detail: [describeValue(value)],
    otherCopy: isForeign(value),
  };
}

function depsOf(list: readonly unknown[], at: At): DepEntry[] | null {
  const deps: DepEntry[] = [];
  for (const [i, value] of list.entries()) {
    const dep = depOf(value);
    if ('reason' in dep)
      return report(at, dep.otherCopy, 'bad-dep', [
        `deps[${i}]`,
        dep.reason,
        ...dep.detail,
      ]);
    deps.push(dep);
  }
  return deps;
}

/** The property injections `metadata` declares, or null after reporting a bad one. */
function propsOf(
  metadata: MetadataRecord | undefined,
  at: At,
): PropEntry[] | null {
  const props: PropEntry[] = [];
  for (const prop of propsIn(metadata)) {
    const dep = depOf(prop.dep);
    if ('reason' in dep)
      return report(at, dep.otherCopy, 'bad-dep', [
        `@Inject on ${String(prop.key)}`,
        dep.reason,
        ...dep.detail,
      ]);
    props.push({ key: prop.key, dep, set: prop.set });
  }
  return props;
}

/**
 * How a class reached the providers list: listed bare, bound to itself by
 * provide(C) or a { token: C } literal, or named by useClass. A bare class
 * and useClass read @Injectable deps; a binding to itself reads static deps
 * only (spec §3.2).
 */
type ClassForm = 'bare' | 'binding' | 'useClass';

/**
 * The record shape of a class provider. It reads `C[Symbol.metadata]` once,
 * the first time it needs the metadata: for the deps when `deps` is
 * undefined, else for the property injections. A bare class takes its
 * lifetime from @Injectable, and `lifetime` is ignored.
 */
function classShape(
  token: TokenKey,
  cls: Ctor,
  deps: unknown,
  lifetime: Lifetime,
  eager: boolean,
  at: At,
  form: ClassForm,
): RecordShape | null {
  // null until read; metadataOf returns an object or undefined.
  let metadata: MetadataRecord | undefined | null = null;
  let life = lifetime;
  let list = deps;
  if (list === undefined) {
    let injectable: InjectableMetadata | undefined;
    try {
      metadata = metadataOf(cls);
      injectable = injectableIn(metadata);
    } catch (error) {
      return fail(at, 'class-throws', describeThrown(error));
    }
    if (form === 'bare') {
      const declared =
        (injectable !== undefined && Object.hasOwn(injectable, 'lifetime')
          ? injectable.lifetime
          : undefined) ?? 'singleton';
      if (!LIFETIMES.has(declared))
        return fail(at, 'bad-injectable-lifetime', describeValue(declared));
      life = declared as Lifetime;
    }
    // declaredDeps reports a static deps that is not an array and a class
    // that declares deps in both places, so list is an array or still
    // undefined here.
    list = declaredDeps(cls, injectable, form !== 'binding', at);
    if (list === null) return null;
  }
  if (list === undefined) {
    // C.length counts neither defaulted nor rest parameters, so such a class
    // builds with its defaults.
    let arity: number;
    try {
      arity = cls.length;
    } catch (error) {
      return fail(at, 'class-throws', describeThrown(error));
    }
    if (arity > 0) {
      at.errors.push(
        new MissingDepsError({
          token: displayName(token),
          module: at.site.module,
          arity,
          useClass: form === 'useClass' ? displayName(cls) : null,
          bare: form === 'bare',
        }),
      );
      return null;
    }
    list = [];
  }
  if (!Array.isArray(list)) return fail(at, 'deps-not-array');
  const entries = depsOf(list, at);
  if (entries === null) return null;
  let props: PropEntry[] | null;
  try {
    props = propsOf(metadata === null ? metadataOf(cls) : metadata, at);
  } catch (error) {
    return fail(at, 'class-throws', describeThrown(error));
  }
  if (props === null) return null;
  return {
    kind: 'class',
    token,
    lifetime: life,
    eager,
    deps: entries,
    props,
    useClass: cls,
  };
}

/**
 * Validates one entry of a module's `providers` and returns its record shape.
 * On a malformed entry it pushes the error and returns null.
 */
export function normalizeProvider(
  entry: unknown,
  site: ProviderSite,
  errors: NexusError[],
): RecordShape | null {
  const at: At = { site, errors, prefix: NO_PREFIX };

  const module = resolveModuleRef(entry);
  if (module !== undefined) return fail(at, 'is-a-module', module.name);

  if (
    readProvider(entry) === undefined &&
    typeof entry === 'function' &&
    isToken(entry)
  ) {
    const cls = entry as Ctor;
    return classShape(cls, cls, undefined, 'singleton', true, at, 'bare');
  }

  let definition: Definition | null;
  try {
    definition = definitionOf(entry, at);
  } catch (error) {
    return fail(at, 'options-throw', describeThrown(error));
  }
  if (definition === null) return null;
  return definitionShape(definition, at);
}

/**
 * The record shape for a token and its options. A provide() result and a
 * provider literal both reach this function, so equal definitions give equal
 * shapes and equal errors.
 */
function definitionShape(
  { token, options }: Definition,
  at: At,
): RecordShape | null {
  if (!isToken(token)) {
    at.errors.push(invalidToken(token, at.site, null));
    return null;
  }
  if (token === REQUEST) return fail(at, 'provides-request');

  if (options === undefined) {
    if (typeof token !== 'function')
      return fail(at, 'no-definition', displayName(token));
    return classShape(
      token,
      token as Ctor,
      undefined,
      'singleton',
      true,
      at,
      'binding',
    );
  }

  let kind: (typeof DEFINITION_KEYS)[number] | undefined;
  for (const key of DEFINITION_KEYS) {
    if (!Object.hasOwn(options, key)) continue;
    if (kind !== undefined)
      return fail(
        at,
        'several-definitions',
        DEFINITION_KEYS.filter((k) => Object.hasOwn(options, k)).join(' and '),
      );
    kind = key;
  }
  // exactOptionalPropertyTypes is off, so a caller can write
  // `{ useValue, lifetime: undefined }`; that reads as no lifetime key, not
  // as a lifetime set to undefined.
  const hasLifetime = options.lifetime !== undefined;
  const lifetime = hasLifetime ? options.lifetime : 'singleton';
  if (!LIFETIMES.has(lifetime)) {
    return fail(at, 'bad-lifetime', describeValue(lifetime));
  }
  const life = lifetime as Lifetime;
  // Read as lifetime is: an eager key set to undefined reads as no key.
  const eager = options.eager ?? true;
  if (typeof eager !== 'boolean')
    return fail(at, 'bad-eager', describeValue(eager));
  if (
    !eager &&
    (life === 'transient' || kind === 'useValue' || kind === 'useExisting')
  )
    return fail(
      at,
      'eager-not-deferrable',
      kind === 'useValue'
        ? 'value'
        : kind === 'useExisting'
          ? 'alias'
          : 'transient',
    );

  switch (kind) {
    case undefined:
      if (typeof token !== 'function')
        return fail(at, 'no-definition', displayName(token));
      return classShape(
        token,
        token as Ctor,
        options.deps,
        life,
        eager,
        at,
        'binding',
      );
    case 'useClass': {
      const cls = options.useClass;
      if (typeof cls !== 'function' || !isToken(cls))
        return fail(at, 'use-class-not-a-class');
      return classShape(
        token,
        cls as Ctor,
        options.deps,
        life,
        eager,
        at,
        'useClass',
      );
    }
    case 'useValue':
      if (hasLifetime) return fail(at, 'value-with-lifetime');
      return {
        kind: 'value',
        token,
        lifetime: null,
        eager: true,
        deps: [],
        props: [],
        value: options.useValue,
      };
    case 'useFactory': {
      const useFactory = options.useFactory;
      if (typeof useFactory !== 'function')
        return fail(at, 'factory-not-a-function');
      // deps defaults to [] for a factory in both forms (spec §3.2).
      const list = options.deps ?? [];
      if (!Array.isArray(list)) return fail(at, 'deps-not-array');
      const deps = depsOf(list, at);
      if (!deps) return null;
      return {
        kind: 'factory',
        token,
        lifetime: life,
        eager,
        deps,
        props: [],
        useFactory: useFactory as (...args: unknown[]) => unknown,
      };
    }
    case 'useExisting': {
      if (hasLifetime) return fail(at, 'alias-with-lifetime');
      const target = options.useExisting;
      if (!isToken(target)) {
        at.errors.push(invalidToken(target, at.site, 'alias-target'));
        return null;
      }
      if (target instanceof MultiToken)
        return fail(at, 'alias-to-multi-token', target.description);
      return {
        kind: 'alias',
        token,
        lifetime: null,
        eager: true,
        deps: [],
        props: [],
        target,
      };
    }
  }
}

const FOR_ROOT_ASYNC: readonly string[] = ['(the forRootAsync() factory)'];

/** The provider a forRoot() or forRootAsync() instance adds for its options token. */
export function optionsShape(
  internals: ModuleInternals,
  site: ProviderSite,
  errors: NexusError[],
): RecordShape | null {
  const { options, schema, source } = internals;
  if (options === undefined || source === undefined) return null;
  if (source.kind === 'value') {
    return {
      kind: 'value',
      token: options,
      lifetime: null,
      eager: true,
      deps: [],
      props: [],
      value: source.value,
      schema,
    };
  }
  const at: At = { site, errors, prefix: FOR_ROOT_ASYNC };
  const { useFactory } = source;
  if (typeof useFactory !== 'function')
    return fail(at, 'factory-not-a-function');
  if (!Array.isArray(source.deps)) return fail(at, 'deps-not-array');
  const deps = depsOf(source.deps, at);
  if (!deps) return null;
  return {
    kind: 'factory',
    token: options,
    lifetime: 'singleton',
    eager: true,
    deps,
    props: [],
    useFactory: useFactory as (...args: unknown[]) => unknown,
    schema,
  };
}
