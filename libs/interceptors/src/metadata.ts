import { Token } from '@nexusdi/core';

import type { InterceptorToken } from './types.js';

/** Any class, abstract or not; core's Class type, which its entry does not export. */
export type AnyClass = abstract new (...args: never) => unknown;

/** Where UseInterceptors records declarations on a class's metadata object. */
export const METADATA_KEY = Symbol.for('nexusdi.interceptors');

/** Keys the proxy never intercepts (spec R11). */
export const EXCLUDED_KEYS: ReadonlySet<PropertyKey> = new Set([
  'constructor',
  'onInit',
  'then',
]);

export function isInterceptorToken(value: unknown): value is InterceptorToken {
  return value instanceof Token || typeof value === 'function';
}

export interface ParsedMap {
  readonly class: readonly InterceptorToken[];
  readonly methods: ReadonlyMap<string | symbol, readonly InterceptorToken[]>;
}

interface Recorded {
  class: InterceptorToken[];
  methods: Map<string | symbol, InterceptorToken[]>;
}

const own = (value: object, key: PropertyKey): unknown =>
  Object.hasOwn(value, key)
    ? (value as Record<PropertyKey, unknown>)[key]
    : undefined;

const tokenList = (value: unknown): InterceptorToken[] | undefined =>
  Array.isArray(value) && value.every(isInterceptorToken)
    ? [...value]
    : undefined;

/** Reads `{ class?, methods? }` from own keys only (SEC-013). */
export function parseMap(value: unknown): ParsedMap | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined;
  const classList = tokenList(own(value, 'class') ?? []);
  if (classList === undefined) return undefined;
  const methodsValue = own(value, 'methods') ?? {};
  if (typeof methodsValue !== 'object' || methodsValue === null)
    return undefined;
  const methods = new Map<string | symbol, InterceptorToken[]>();
  for (const key of Reflect.ownKeys(methodsValue)) {
    const list = tokenList(own(methodsValue, key));
    if (list === undefined) return undefined;
    methods.set(key, list);
  }
  return { class: classList, methods };
}

function recordOf(metadata: object): Recorded {
  const existing = own(metadata, METADATA_KEY);
  if (existing !== undefined) return existing as Recorded;
  const recorded: Recorded = { class: [], methods: new Map() };
  Object.defineProperty(metadata, METADATA_KEY, { value: recorded });
  return recorded;
}

/** Decorators apply bottom up, so each call prepends: the top one ends first. */
export function recordClass(
  metadata: object,
  tokens: readonly InterceptorToken[],
): void {
  recordOf(metadata).class.unshift(...tokens);
}

export function recordMethod(
  metadata: object,
  key: string | symbol,
  tokens: readonly InterceptorToken[],
): void {
  const recorded = recordOf(metadata);
  recorded.methods.set(key, [...tokens, ...(recorded.methods.get(key) ?? [])]);
}

export interface DeclarationProblem {
  readonly reason: 'declaration' | 'two-forms';
  readonly target: string;
}

export interface Declarations {
  readonly classTokens: readonly InterceptorToken[];
  readonly methods: ReadonlyMap<string | symbol, readonly InterceptorToken[]>;
  readonly problems: readonly DeclarationProblem[];
  /** Some class in the chain declares an interceptor. */
  readonly any: boolean;
}

const metadataSymbol = (): symbol =>
  (Symbol as { metadata?: symbol }).metadata ?? Symbol.for('Symbol.metadata');

/** The class and its bases, base first. */
function classChain(cls: AnyClass): AnyClass[] {
  const chain: AnyClass[] = [];
  for (
    let current: unknown = cls;
    typeof current === 'function' && current !== Function.prototype;
    current = Object.getPrototypeOf(current)
  ) {
    chain.unshift(current as AnyClass);
  }
  return chain;
}

const CACHE = new WeakMap<AnyClass, Declarations>();

/**
 * A class's interceptor declarations up its class chain (spec R5): class
 * lists accumulate base first; a subclass's method list replaces its
 * base's for that name. Each class uses one form, static or decorators.
 */
export function declarationsOf(cls: AnyClass): Declarations {
  const cached = CACHE.get(cls);
  if (cached !== undefined) return cached;
  const classTokens: InterceptorToken[] = [];
  const methods = new Map<string | symbol, readonly InterceptorToken[]>();
  const problems: DeclarationProblem[] = [];
  for (const current of classChain(cls)) {
    const target = current.name || '(anonymous class)';
    const staticValue = own(current, 'interceptors');
    const fromStatic =
      staticValue === undefined ? undefined : parseMap(staticValue);
    if (staticValue !== undefined && fromStatic === undefined) {
      problems.push({ reason: 'declaration', target });
      continue;
    }
    const metadata = own(current, metadataSymbol());
    const fromDecorators =
      typeof metadata === 'object' && metadata !== null
        ? (own(metadata, METADATA_KEY) as Recorded | undefined)
        : undefined;
    if (fromStatic !== undefined && fromDecorators !== undefined) {
      problems.push({ reason: 'two-forms', target });
      continue;
    }
    const declared = fromStatic ?? fromDecorators;
    if (declared === undefined) continue;
    classTokens.push(...declared.class);
    for (const [key, list] of declared.methods) methods.set(key, list);
  }
  const result: Declarations = {
    classTokens,
    methods,
    problems,
    any: classTokens.length > 0 || methods.size > 0,
  };
  CACHE.set(cls, result);
  return result;
}
