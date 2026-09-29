import {
  resolveModuleRef,
  type ModuleInternals,
} from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { isToken } from '../definitions/guards.js';
import { readInjectable, readProps } from '../definitions/metadata.js';
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
const OPTION_KEYS = ['deps', 'lifetime', ...DEFINITION_KEYS] as const;

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
 * `{ value }` with the declared static deps, or null after reporting a
 * getter that throws or a static deps that is not an array.
 */
function readStaticDeps(
  cls: Ctor,
  fail: Fail,
): { readonly value: unknown } | null {
  let value: unknown;
  try {
    value = staticDepsOf(cls);
  } catch (error) {
    return fail('static-deps-throws', describeThrown(error));
  }
  if (value !== undefined && !Array.isArray(value))
    return fail('static-deps-not-array');
  return { value };
}

/**
 * Reads a class's @Injectable metadata deps and its static deps together, so
 * the conflict check (both declared, own or inherited) runs for every class
 * form that has no explicit deps option, whether or not that form's deps can
 * come from metadata. Returns null after reporting a getter that throws, a
 * static deps that is not an array, or a class that declares both.
 */
function readDeclaredDeps(
  cls: Ctor,
  fail: Fail,
): { readonly fromMetadata: unknown; readonly fromStatic: unknown } | null {
  const metadata = readClass(() => readInjectable(cls), fail);
  if (metadata === null) return null;
  const fromMetadata =
    metadata !== undefined && Object.hasOwn(metadata, 'deps')
      ? metadata.deps
      : undefined;
  const declared = readStaticDeps(cls, fail);
  if (declared === null) return null;
  if (fromMetadata !== undefined && declared.value !== undefined)
    return fail('deps-in-both');
  return { fromMetadata, fromStatic: declared.value };
}

/** What a class form takes as deps when it sets no explicit deps option. */
type DepsResolver = (
  cls: Ctor,
  fail: Fail,
) => { readonly value: unknown } | null;

/**
 * Builds a deps resolver for one class form's policy: true when the form may
 * take deps from @Injectable metadata (a bare class or useClass: C), false
 * when it reads static deps only (provide(C), provide(C, { lifetime }) and a
 * { token: C } literal never read @Injectable for deps). Either way
 * readDeclaredDeps runs the conflict check first (spec §3.2).
 */
function makeDepsResolver(useMetadata: boolean): DepsResolver {
  return (cls, fail) => {
    const declared = readDeclaredDeps(cls, fail);
    if (declared === null) return null;
    return {
      value: useMetadata
        ? (declared.fromMetadata ?? declared.fromStatic)
        : declared.fromStatic,
    };
  };
}

/**
 * The deps a bare class or a useClass binding takes when it sets no deps
 * option: its @Injectable metadata or its static deps (spec §3.2).
 */
const declaredDeps = makeDepsResolver(true);

/**
 * The deps provide(C), provide(C, { lifetime }) and a { token: C } literal
 * take when they set no deps option: static deps only (spec §3.2).
 */
const staticOnlyDeps = makeDepsResolver(false);

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

function definitionOf(entry: unknown, fail: Fail): Definition | null {
  const spec = readProvider(entry);
  if (spec !== undefined) {
    const { token, options } = spec;
    if (options === undefined) return { token, options: undefined };
    if (typeof options !== 'object' || options === null) {
      return fail('options-not-object', describeValue(options));
    }
    return { token, options: pickOwn(options, OPTION_KEYS) };
  }
  if (isLiteral(entry))
    return { token: entry.token, options: pickOwn(entry, OPTION_KEYS) };
  return fail('not-a-provider', describeValue(entry));
}

/** Where a provider entry sits, for error messages. */
export interface ProviderSite {
  readonly module: string;
  readonly index: number;
}

/** Reports a malformed entry: the reason id, then the values its text names. */
type Fail = (reason: InvalidProviderReason, ...detail: string[]) => null;

/**
 * The Fail of one providers entry. `prefix` leads every detail, as
 * `(the forRootAsync() factory)` does for the provider a forRootAsync()
 * instance adds.
 */
function invalidProvider(
  site: ProviderSite,
  errors: NexusError[],
  prefix: readonly string[],
): Fail {
  return (reason, ...detail) => {
    errors.push(
      new InvalidProviderError({
        module: site.module,
        index: site.index,
        reason,
        detail: [...prefix, ...detail],
      }),
    );
    return null;
  };
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
  });
}

/** Reads from a user class, turning a throwing getter or Proxy trap into a provider error. */
function readClass<T>(read: () => T, fail: Fail): T | null {
  try {
    return read();
  } catch (error) {
    return fail('class-throws', describeThrown(error));
  }
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
      };
    }
    return { kind: value.kind, token: value.token };
  }
  if (value instanceof MultiToken)
    return { reason: 'bare-multi-token', detail: [value.description] };
  if (isToken(value)) return { kind: 'required', token: value };
  return { reason: 'not-a-token', detail: [describeValue(value)] };
}

function depsOf(list: readonly unknown[], fail: Fail): DepEntry[] | null {
  const deps: DepEntry[] = [];
  for (const [i, value] of list.entries()) {
    const dep = depOf(value);
    if ('reason' in dep)
      return fail('bad-dep', `deps[${i}]`, dep.reason, ...dep.detail);
    deps.push(dep);
  }
  return deps;
}

function propsOf(cls: Ctor, fail: Fail): PropEntry[] | null {
  const props: PropEntry[] = [];
  for (const prop of readProps(cls)) {
    const dep = depOf(prop.dep);
    if ('reason' in dep) {
      const where = `@Inject on ${String(prop.key)}`;
      return fail('bad-dep', where, dep.reason, ...dep.detail);
    }
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

function classShape(
  token: TokenKey,
  cls: Ctor,
  deps: unknown,
  lifetime: Lifetime,
  site: ProviderSite,
  errors: NexusError[],
  fail: Fail,
  form: ClassForm,
): RecordShape | null {
  let list = deps;
  if (list === undefined) {
    // The resolver already reports a static deps that is not an array and a
    // class that declares deps in both @Injectable and static deps, so list
    // is an array or still undefined here.
    const readDeps = form === 'binding' ? staticOnlyDeps : declaredDeps;
    const declared = readDeps(cls, fail);
    if (declared === null) return null;
    list = declared.value;
  }
  if (list === undefined) {
    // C.length counts neither defaulted nor rest parameters, so such a class
    // builds with its defaults.
    const arity = readClass(() => cls.length, fail);
    if (arity === null) return null;
    if (arity > 0) {
      errors.push(
        new MissingDepsError({
          token: displayName(token),
          module: site.module,
          arity,
          useClass: form === 'useClass' ? displayName(cls) : null,
          bare: form === 'bare',
        }),
      );
      return null;
    }
    list = [];
  }
  if (!Array.isArray(list)) return fail('deps-not-array');
  const entries = depsOf(list, fail);
  const props = entries && readClass(() => propsOf(cls, fail), fail);
  if (!entries || !props) return null;
  return {
    kind: 'class',
    token,
    lifetime,
    deps: entries,
    props,
    useClass: cls,
  };
}

function bareClass(
  cls: Ctor,
  site: ProviderSite,
  errors: NexusError[],
  fail: Fail,
): RecordShape | null {
  const metadata = readClass(() => readInjectable(cls), fail);
  if (metadata === null) return null;
  const lifetime =
    (metadata !== undefined && Object.hasOwn(metadata, 'lifetime')
      ? metadata.lifetime
      : undefined) ?? 'singleton';
  if (!LIFETIMES.has(lifetime)) {
    return fail('bad-injectable-lifetime', describeValue(lifetime));
  }
  return classShape(
    cls,
    cls,
    undefined,
    lifetime as Lifetime,
    site,
    errors,
    fail,
    'bare',
  );
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
  const fail = invalidProvider(site, errors, []);

  const module = resolveModuleRef(entry);
  if (module !== undefined) return fail('is-a-module', module.name);

  if (
    readProvider(entry) === undefined &&
    typeof entry === 'function' &&
    isToken(entry)
  )
    return bareClass(entry as Ctor, site, errors, fail);

  let definition: Definition | null;
  try {
    definition = definitionOf(entry, fail);
  } catch (error) {
    return fail('options-throw', describeThrown(error));
  }
  if (definition === null) return null;
  return definitionShape(definition, site, errors, fail);
}

/**
 * The record shape for a token and its options. A provide() result and a
 * provider literal both reach this function, so equal definitions give equal
 * shapes and equal errors.
 */
function definitionShape(
  { token, options }: Definition,
  site: ProviderSite,
  errors: NexusError[],
  fail: Fail,
): RecordShape | null {
  if (!isToken(token)) {
    errors.push(invalidToken(token, site, null));
    return null;
  }
  if (token === REQUEST) return fail('provides-request');

  if (options === undefined) {
    if (typeof token !== 'function')
      return fail('no-definition', displayName(token));
    return classShape(
      token,
      token as Ctor,
      undefined,
      'singleton',
      site,
      errors,
      fail,
      'binding',
    );
  }

  const present = DEFINITION_KEYS.filter((key) => Object.hasOwn(options, key));
  if (present.length > 1)
    return fail('several-definitions', present.join(' and '));
  // exactOptionalPropertyTypes is off, so a caller can write
  // `{ useValue, lifetime: undefined }`; that reads as no lifetime key, not
  // as a lifetime set to undefined.
  const hasLifetime = options.lifetime !== undefined;
  const lifetime = hasLifetime ? options.lifetime : 'singleton';
  if (!LIFETIMES.has(lifetime)) {
    return fail('bad-lifetime', describeValue(lifetime));
  }
  const life = lifetime as Lifetime;
  const kind: (typeof DEFINITION_KEYS)[number] | undefined = present[0];

  switch (kind) {
    case undefined:
      if (typeof token !== 'function')
        return fail('no-definition', displayName(token));
      return classShape(
        token,
        token as Ctor,
        options.deps,
        life,
        site,
        errors,
        fail,
        'binding',
      );
    case 'useClass': {
      const cls = options.useClass;
      if (typeof cls !== 'function' || !isToken(cls))
        return fail('use-class-not-a-class');
      return classShape(
        token,
        cls as Ctor,
        options.deps,
        life,
        site,
        errors,
        fail,
        'useClass',
      );
    }
    case 'useValue':
      if (hasLifetime) return fail('value-with-lifetime');
      return {
        kind: 'value',
        token,
        lifetime: null,
        deps: [],
        props: [],
        value: options.useValue,
      };
    case 'useFactory': {
      const useFactory = options.useFactory;
      if (typeof useFactory !== 'function')
        return fail('factory-not-a-function');
      // deps defaults to [] for a factory in both forms (spec §3.2).
      const list = options.deps ?? [];
      if (!Array.isArray(list)) return fail('deps-not-array');
      const deps = depsOf(list, fail);
      if (!deps) return null;
      return {
        kind: 'factory',
        token,
        lifetime: life,
        deps,
        props: [],
        useFactory: useFactory as (...args: unknown[]) => unknown,
      };
    }
    case 'useExisting': {
      if (hasLifetime) return fail('alias-with-lifetime');
      const target = options.useExisting;
      if (!isToken(target)) {
        errors.push(invalidToken(target, site, 'alias-target'));
        return null;
      }
      if (target instanceof MultiToken)
        return fail('alias-to-multi-token', target.description);
      return {
        kind: 'alias',
        token,
        lifetime: null,
        deps: [],
        props: [],
        target,
      };
    }
  }
}

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
      deps: [],
      props: [],
      value: source.value,
      schema,
    };
  }
  const fail = invalidProvider(site, errors, ['(the forRootAsync() factory)']);
  const { useFactory } = source;
  if (typeof useFactory !== 'function') return fail('factory-not-a-function');
  if (!Array.isArray(source.deps)) return fail('deps-not-array');
  const deps = depsOf(source.deps, fail);
  if (!deps) return null;
  return {
    kind: 'factory',
    token: options,
    lifetime: 'singleton',
    deps,
    props: [],
    useFactory: useFactory as (...args: unknown[]) => unknown,
    schema,
  };
}
