import type { NexusGraph } from '@nexusdi/devtools';

import { CliError } from './cli-error.js';

/**
 * The ids core writes: `m<n>` for modules, `p<n>` for providers, and
 * `request` for the built-in REQUEST provider. Both renderers write ids
 * unquoted, so the check accepts these shapes only.
 */
const MODULE_ID = /^m\d+$/;
const PROVIDER_ID = /^(p\d+|request)$/;
const LIFETIMES = ['singleton', 'scoped', 'transient', null] as const;
const KINDS = ['class', 'value', 'factory', 'alias'] as const;
const EDGE_KINDS = ['required', 'optional', 'lazy', 'all', 'alias'] as const;
const FIX =
  'Write the file with JSON.stringify(graph(ship)) from @nexusdi/devtools.';

type Json = Readonly<Record<string, unknown>>;

class Reader {
  constructor(private readonly shown: string) {}

  fail(path: string): never {
    throw new CliError(
      2,
      `${this.shown} is not a NexusGraph: ${path} is missing or has the wrong type.`,
      FIX,
    );
  }

  record(value: unknown, path: string): Json {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      this.fail(path);
    return value as Json;
  }

  list(value: unknown, path: string): readonly unknown[] {
    if (!Array.isArray(value)) this.fail(path);
    return value;
  }

  string(item: Json, key: string, path: string): string {
    const value = item[key];
    if (typeof value !== 'string') this.fail(`${path}.${key}`);
    return value;
  }

  /** A missing key reads as null, for graphs written before the key existed. */
  stringOrNull(item: Json, key: string, path: string): string | null {
    const value = item[key] ?? null;
    if (value === null || typeof value === 'string') return value;
    this.fail(`${path}.${key}`);
  }

  /** An id of the given shape that no earlier module or provider took. */
  id(
    item: Json,
    path: string,
    shape: RegExp,
    shapes: string,
    seen: Set<string>,
  ): string {
    const value = this.string(item, 'id', path);
    if (!shape.test(value))
      throw new CliError(
        2,
        `${this.shown} is not a NexusGraph: ${path}.id is ${JSON.stringify(value)}, and ${shapes}.`,
        FIX,
      );
    if (seen.has(value))
      throw new CliError(
        2,
        `${this.shown} is not a NexusGraph: ${path}.id is ${JSON.stringify(value)}, which an earlier entry already uses.`,
        FIX,
      );
    seen.add(value);
    return value;
  }

  boolean(item: Json, key: string, path: string): boolean {
    const value = item[key];
    if (typeof value !== 'boolean') this.fail(`${path}.${key}`);
    return value;
  }

  strings(item: Json, key: string, path: string): string[] {
    return this.list(item[key], `${path}.${key}`).map((value, i) => {
      if (typeof value !== 'string') this.fail(`${path}.${key}[${i}]`);
      return value;
    });
  }

  oneOf<T>(item: Json, key: string, path: string, values: readonly T[]): T {
    const value = item[key] as T;
    if (!values.includes(value)) this.fail(`${path}.${key}`);
    return value;
  }
}

/** A NexusGraph read from JSON, checked field by field. Throws CliError 2. */
export function parseGraphJson(text: string, shown: string): NexusGraph {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new CliError(
      2,
      `${shown} is not JSON: ${(error as Error).message}`,
      FIX,
    );
  }
  const r = new Reader(shown);
  const root = r.record(value, '(root)');
  const ids = new Set<string>();

  const modules = r.list(root['modules'], 'modules').map((raw, i) => {
    const path = `modules[${i}]`;
    const m = r.record(raw, path);
    return {
      id: r.id(m, path, MODULE_ID, 'module ids are m<n>', ids),
      name: r.string(m, 'name', path),
      global: r.boolean(m, 'global', path),
      imports: r.strings(m, 'imports', path),
      exports: r.strings(m, 'exports', path),
    };
  });
  const moduleIds = new Set(modules.map((m) => m.id));

  const providers = r.list(root['providers'], 'providers').map((raw, i) => {
    const path = `providers[${i}]`;
    const p = r.record(raw, path);
    const module = r.string(p, 'module', path);
    if (!moduleIds.has(module)) r.fail(`${path}.module`);
    const implementation = r.stringOrNull(p, 'implementation', path);
    return {
      id: r.id(p, path, PROVIDER_ID, 'provider ids are p<n> or request', ids),
      token: r.string(p, 'token', path),
      module,
      lifetime: r.oneOf(p, 'lifetime', path, LIFETIMES),
      kind: r.oneOf(p, 'kind', path, KINDS),
      eager: r.boolean(p, 'eager', path),
      async: r.oneOf(p, 'async', path, [true, false, null] as const),
      implementation,
    };
  });
  const providerIds = new Set(providers.map((p) => p.id));

  const edges = r.list(root['edges'], 'edges').map((raw, i) => {
    const path = `edges[${i}]`;
    const e = r.record(raw, path);
    const from = r.string(e, 'from', path);
    const to = r.string(e, 'to', path);
    if (!providerIds.has(from)) r.fail(`${path}.from`);
    if (!providerIds.has(to)) r.fail(`${path}.to`);
    return { from, to, kind: r.oneOf(e, 'kind', path, EDGE_KINDS) };
  });

  for (const [i, m] of modules.entries())
    for (const target of m.imports)
      if (!moduleIds.has(target)) r.fail(`modules[${i}].imports`);

  return { modules, providers, edges };
}
