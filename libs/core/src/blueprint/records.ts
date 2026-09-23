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

/** Where a provider entry sits, for error messages. */
export interface ProviderSite {
  readonly module: string;
  readonly index: number;
}

type Fail = (reason: string) => null;

/**
 * The token an entry names, even when the entry is malformed. The walk marks
 * it broken, so pass 3 does not report a missing provider for a token whose
 * provider already has an error.
 */
export function tokenOfEntry(entry: unknown): TokenKey | undefined {
  const candidate = readProvider(entry)?.token ?? entry;
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
    // C.length counts neither defaulted nor rest parameters, so such a class
    // builds with its defaults.
    if (cls.length > 0) {
      errors.push(
        new MissingDepsError({
          token: displayName(cls),
          module: site.module,
          arity: cls.length,
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
    metadata?.deps,
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

  const spec = readProvider(entry);
  if (spec === undefined) {
    if (typeof entry === 'function' && isToken(entry))
      return bareClass(entry as Ctor, site, errors, fail);
    return fail(
      `is ${describeValue(entry)}, not a provider; create one with provide()`,
    );
  }

  const { token, options } = spec;
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
  if (typeof options !== 'object' || options === null) {
    return fail(
      `has options that are ${describeValue(options)}, not an object`,
    );
  }

  const o = options as Readonly<Record<string, unknown>>;
  const present = DEFINITION_KEYS.filter((key) => key in o);
  if (present.length > 1)
    return fail(`sets ${present.join(' and ')}; use one of them`);
  // exactOptionalPropertyTypes is off, so a caller can write
  // `{ useValue, lifetime: undefined }`; that reads as no lifetime key, not
  // as a lifetime set to undefined.
  const hasLifetime = o['lifetime'] !== undefined;
  const lifetime = hasLifetime ? o['lifetime'] : 'singleton';
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
        o['deps'],
        life,
        site,
        errors,
        fail,
      );
    case 'useClass': {
      const cls = o['useClass'];
      if (typeof cls !== 'function' || !isToken(cls))
        return fail('has a useClass that is not a class');
      return classShape(
        token,
        cls as Ctor,
        o['deps'],
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
        value: o['useValue'],
      };
    case 'useFactory': {
      const useFactory = o['useFactory'];
      if (typeof useFactory !== 'function')
        return fail('has a useFactory that is not a function');
      if (!Array.isArray(o['deps']))
        return fail(
          'has a useFactory without a deps array; pass deps: [] for none',
        );
      const deps = depsOf(o['deps'], fail);
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
      const target = o['useExisting'];
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
