import {
  resolveModuleRef,
  type ModuleInternals,
} from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { isToken } from '../definitions/guards.js';
import { readInjectable, readProps } from '../definitions/metadata.js';
import { isModifier } from '../definitions/modifiers.js';
import { readProvider } from '../definitions/provide.js';
import { REQUEST } from '../definitions/request.js';
import { MultiToken, displayName } from '../definitions/token.js';
import type { Ctor, Lifetime } from '../definitions/types.js';
import {
  describeThrown,
  InvalidProviderError,
  InvalidTokenError,
  MissingDepsError,
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
const NO_DEFINITION =
  'with no definition; add useClass, useValue, useFactory or useExisting';

/** The keys a provider definition reads. Pass 1 ignores every other key. */
const OPTION_KEYS = ['deps', 'lifetime', ...DEFINITION_KEYS] as const;

type OptionKey = (typeof OPTION_KEYS)[number];
type Options = { readonly [K in OptionKey]?: unknown };

/**
 * Copies the option keys an object sets on itself into an object with no
 * prototype. A key that only the prototype chain supplies is not an option
 * (spec §9, SEC-003), and each option getter runs once, here.
 */
function ownOptions(source: object): Options {
  const options: { [K in OptionKey]?: unknown } = Object.create(null);
  for (const key of OPTION_KEYS) {
    if (Object.hasOwn(source, key))
      options[key] = (source as Record<OptionKey, unknown>)[key];
  }
  return options;
}

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
    return fail(
      `has a static deps that throws when read: ${describeThrown(error)}`,
    );
  }
  if (value !== undefined && !Array.isArray(value))
    return fail('has a static deps that is not an array');
  return { value };
}

/**
 * The deps a class declares: its @Injectable metadata or its static deps.
 * Declaring both is an error, because either one could silently shadow the
 * other. classShape calls this once, for every class form that has no
 * explicit deps option, so the conflict check runs the same way for a bare
 * class, provide(C), provide(C, { lifetime }), a { token: C } literal and a
 * useClass binding alike; an explicit deps option wins as a whole and this
 * never runs (spec §3.2).
 */
function declaredDeps(
  cls: Ctor,
  fail: Fail,
): { readonly value: unknown } | null {
  const fromMetadata = readInjectable(cls)?.deps;
  const declared = readStaticDeps(cls, fail);
  if (declared === null) return null;
  if (fromMetadata !== undefined && declared.value !== undefined)
    return fail('declares deps in both @Injectable and static deps; keep one');
  return { value: fromMetadata ?? declared.value };
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

function definitionOf(entry: unknown, fail: Fail): Definition | null {
  const spec = readProvider(entry);
  if (spec !== undefined) {
    const { token, options } = spec;
    if (options === undefined) return { token, options: undefined };
    if (typeof options !== 'object' || options === null) {
      return fail(
        `has options that are ${describeValue(options)}, not an object`,
      );
    }
    return { token, options: ownOptions(options) };
  }
  if (isLiteral(entry))
    return { token: entry.token, options: ownOptions(entry) };
  return fail(
    `is ${describeValue(entry)}, not a provider; list a class, a provide() result or a { token } literal`,
  );
}

/** Where a provider entry sits, for error messages. */
export interface ProviderSite {
  readonly module: string;
  readonly index: number;
}

type Fail = (reason: string) => null;

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

/** A dep, or the reason it is not one. */
function depOf(value: unknown, where: string): DepEntry | string {
  if (isModifier(value)) {
    const wantsMulti = value.kind === 'all';
    if (
      !isToken(value.token) ||
      value.token instanceof MultiToken !== wantsMulti
    ) {
      const takes = wantsMulti
        ? 'all() takes a MultiToken'
        : `${value.kind}() takes a class or a Token`;
      return `${where} is ${value.kind}(${describeValue(value.token)}); ${takes}`;
    }
    return { kind: value.kind, token: value.token };
  }
  if (value instanceof MultiToken)
    return `${where} is the MultiToken ${value.description}; wrap it in all()`;
  if (isToken(value)) return { kind: 'required', token: value };
  return `${where} is ${describeValue(value)}, not a token`;
}

function depsOf(list: readonly unknown[], fail: Fail): DepEntry[] | null {
  const deps: DepEntry[] = [];
  for (const [i, value] of list.entries()) {
    const dep = depOf(value, `deps[${i}]`);
    if (typeof dep === 'string') return fail(dep);
    deps.push(dep);
  }
  return deps;
}

function propsOf(cls: Ctor, fail: Fail): PropEntry[] | null {
  const props: PropEntry[] = [];
  for (const prop of readProps(cls)) {
    const dep = depOf(prop.dep, `@Inject on ${String(prop.key)}`);
    if (typeof dep === 'string') return fail(dep);
    props.push({ key: prop.key, dep, set: prop.set });
  }
  return props;
}

function classShape(
  token: TokenKey,
  cls: Ctor,
  deps: unknown,
  lifetime: Lifetime,
  site: ProviderSite,
  errors: NexusError[],
  fail: Fail,
): RecordShape | null {
  let list = deps;
  if (list === undefined) {
    // declaredDeps already reports a static deps that is not an array and a
    // class that declares deps in both @Injectable and static deps, so list
    // is an array or still undefined here.
    const declared = declaredDeps(cls, fail);
    if (declared === null) return null;
    list = declared.value;
  }
  if (list === undefined) {
    // C.length counts neither defaulted nor rest parameters, so such a class
    // builds with its defaults.
    if (cls.length > 0) {
      errors.push(
        new MissingDepsError({
          token: displayName(token),
          module: site.module,
          arity: cls.length,
          useClass: token === cls ? null : displayName(cls),
        }),
      );
      return null;
    }
    list = [];
  }
  if (!Array.isArray(list)) return fail('has deps that are not an array');
  const entries = depsOf(list, fail);
  const props = entries && propsOf(cls, fail);
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
  const metadata = readInjectable(cls);
  const lifetime = metadata?.lifetime ?? 'singleton';
  if (!LIFETIMES.has(lifetime)) {
    return fail(
      `has the @Injectable lifetime ${describeValue(lifetime)}; use 'singleton', 'scoped' or 'transient'`,
    );
  }
  return classShape(
    cls,
    cls,
    undefined,
    lifetime as Lifetime,
    site,
    errors,
    fail,
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
  const fail: Fail = (reason) => {
    errors.push(
      new InvalidProviderError({
        module: site.module,
        index: site.index,
        reason,
      }),
    );
    return null;
  };

  const module = resolveModuleRef(entry);
  if (module !== undefined)
    return fail(`is the module ${module.name}; add it to imports`);

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
    return fail(`throws when its options are read: ${describeThrown(error)}`);
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
    errors.push(new InvalidTokenError({ received: describeValue(token) }));
    return null;
  }
  if (token === REQUEST)
    return fail('provides REQUEST, which createScope({ request }) supplies');

  if (options === undefined) {
    if (typeof token !== 'function')
      return fail(`provides ${displayName(token)} ${NO_DEFINITION}`);
    return classShape(
      token,
      token as Ctor,
      undefined,
      'singleton',
      site,
      errors,
      fail,
    );
  }

  const present = DEFINITION_KEYS.filter((key) => Object.hasOwn(options, key));
  if (present.length > 1)
    return fail(`sets ${present.join(' and ')}; use one of them`);
  // exactOptionalPropertyTypes is off, so a caller can write
  // `{ useValue, lifetime: undefined }`; that reads as no lifetime key, not
  // as a lifetime set to undefined.
  const hasLifetime = options.lifetime !== undefined;
  const lifetime = hasLifetime ? options.lifetime : 'singleton';
  if (!LIFETIMES.has(lifetime)) {
    return fail(
      `has the lifetime ${describeValue(lifetime)}; use 'singleton', 'scoped' or 'transient'`,
    );
  }
  const life = lifetime as Lifetime;
  const kind: (typeof DEFINITION_KEYS)[number] | undefined = present[0];

  switch (kind) {
    case undefined:
      if (typeof token !== 'function')
        return fail(`provides ${displayName(token)} ${NO_DEFINITION}`);
      return classShape(
        token,
        token as Ctor,
        options.deps,
        life,
        site,
        errors,
        fail,
      );
    case 'useClass': {
      const cls = options.useClass;
      if (typeof cls !== 'function' || !isToken(cls))
        return fail('has a useClass that is not a class');
      return classShape(
        token,
        cls as Ctor,
        options.deps,
        life,
        site,
        errors,
        fail,
      );
    }
    case 'useValue':
      if (hasLifetime)
        return fail('sets a lifetime on useValue; a value has none');
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
        return fail('has a useFactory that is not a function');
      // deps defaults to [] for a factory in both forms (spec §3.2).
      const list = options.deps ?? [];
      if (!Array.isArray(list)) return fail('has deps that are not an array');
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
      if (hasLifetime)
        return fail('sets a lifetime on useExisting; an alias has none');
      const target = options.useExisting;
      if (!isToken(target)) {
        errors.push(new InvalidTokenError({ received: describeValue(target) }));
        return null;
      }
      if (target instanceof MultiToken) {
        return fail(
          `aliases the MultiToken ${target.description}; useExisting takes a class or a Token`,
        );
      }
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

/** The provider a with() instance adds for its options token. */
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
  const fail: Fail = (reason) => {
    errors.push(
      new InvalidProviderError({
        module: site.module,
        index: site.index,
        reason: `(the with() factory) ${reason}`,
      }),
    );
    return null;
  };
  const deps = depsOf(source.deps, fail);
  if (!deps) return null;
  return {
    kind: 'factory',
    token: options,
    lifetime: 'singleton',
    deps,
    props: [],
    useFactory: source.useFactory,
    schema,
  };
}
