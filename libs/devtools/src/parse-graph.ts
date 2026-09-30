import { DevtoolsError } from './devtools-error.js';
import type { NexusGraph } from './graph.js';

type Json = Readonly<Record<string, unknown>>;

const LIFETIMES = ['singleton', 'scoped', 'transient', null] as const;
const KINDS = ['class', 'value', 'factory', 'alias'] as const;
const ASYNC = [true, false, null] as const;
const EDGE_KINDS = ['required', 'optional', 'lazy', 'all', 'alias'] as const;
const FIX =
  'Fix: pass JSON.parse of the text that JSON.stringify(graph(ship)), JSON.stringify(inspect(root)) or nexusdi graph --format json wrote.';

function invalid(path: string, problem: string): never {
  throw new DevtoolsError(
    { code: 'NEXUS_DEVTOOLS_GRAPH_INVALID', path },
    { text: `not a NexusGraph: ${path} ${problem}.\n  ${FIX}` },
  );
}

function wrongType(path: string): never {
  return invalid(path, 'is missing or has the wrong type');
}

function record(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    wrongType(path);
  return value as Json;
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) wrongType(path);
  return value;
}

function string(item: Json, key: string, path: string): string {
  const value = item[key];
  if (typeof value !== 'string') wrongType(`${path}.${key}`);
  return value;
}

function boolean(item: Json, key: string, path: string): boolean {
  const value = item[key];
  if (typeof value !== 'boolean') wrongType(`${path}.${key}`);
  return value;
}

function strings(item: Json, key: string, path: string): string[] {
  return list(item[key], `${path}.${key}`).map((value, i) => {
    if (typeof value !== 'string') wrongType(`${path}.${key}[${i}]`);
    return value;
  });
}

function oneOf<T>(
  item: Json,
  key: string,
  path: string,
  values: readonly T[],
): T {
  const value = item[key] as T;
  if (!values.includes(value)) wrongType(`${path}.${key}`);
  return value;
}

/**
 * Module and provider ids share one namespace, because a module's exports
 * mix both. Maps each id to the path of the entry that took it first.
 */
function claim(owners: Map<string, string>, item: Json, path: string): string {
  const id = string(item, 'id', path);
  const owner = owners.get(id);
  if (owner !== undefined)
    invalid(
      `${path}.id`,
      `is ${JSON.stringify(id)}, which ${owner} already uses`,
    );
  owners.set(id, `${path}.id`);
  return id;
}

function refer(
  ids: { has(id: string): boolean },
  id: string,
  path: string,
  owner: string,
): void {
  if (!ids.has(id))
    invalid(path, `is ${JSON.stringify(id)}, which no ${owner} has`);
}

/**
 * A NexusGraph read from JSON.parse output, checked field by field. Ids are
 * opaque strings: the checks cover types, unique ids and references. Returns
 * a copy that shares nothing with `value`. Throws DevtoolsError
 * NEXUS_DEVTOOLS_GRAPH_INVALID, whose `path` names the first bad field.
 */
export function parseGraph(value: unknown): NexusGraph {
  const root = record(value, '(root)');
  const owners = new Map<string, string>();

  const modules: NexusGraph['modules'] = list(root['modules'], 'modules').map(
    (raw, i) => {
      const path = `modules[${i}]`;
      const m = record(raw, path);
      return {
        id: claim(owners, m, path),
        name: string(m, 'name', path),
        global: boolean(m, 'global', path),
        imports: strings(m, 'imports', path),
        exports: strings(m, 'exports', path),
      };
    },
  );
  const moduleIds = new Set(modules.map((m) => m.id));

  const providers: NexusGraph['providers'] = list(
    root['providers'],
    'providers',
  ).map((raw, i) => {
    const path = `providers[${i}]`;
    const p = record(raw, path);
    const id = claim(owners, p, path);
    const token = string(p, 'token', path);
    const module = string(p, 'module', path);
    refer(moduleIds, module, `${path}.module`, 'module');
    const lifetime = oneOf(p, 'lifetime', path, LIFETIMES);
    const kind = oneOf(p, 'kind', path, KINDS);
    const eager = boolean(p, 'eager', path);
    const async = oneOf(p, 'async', path, ASYNC);
    const implementation = p['implementation'];
    if (implementation !== null && typeof implementation !== 'string')
      wrongType(`${path}.implementation`);
    const internal = boolean(p, 'internal', path);
    const notes = strings(p, 'notes', path);
    return {
      id,
      token,
      module,
      lifetime,
      kind,
      eager,
      async,
      notes,
      implementation,
      internal,
    };
  });
  const providerIds = new Set(providers.map((p) => p.id));

  const edges: NexusGraph['edges'] = list(root['edges'], 'edges').map(
    (raw, i) => {
      const path = `edges[${i}]`;
      const e = record(raw, path);
      const from = string(e, 'from', path);
      const to = string(e, 'to', path);
      const kind = oneOf(e, 'kind', path, EDGE_KINDS);
      refer(providerIds, from, `${path}.from`, 'provider');
      refer(providerIds, to, `${path}.to`, 'provider');
      return { from, to, kind };
    },
  );

  for (const [i, m] of modules.entries()) {
    for (const [j, id] of m.imports.entries())
      refer(moduleIds, id, `modules[${i}].imports[${j}]`, 'module');
    for (const [j, id] of m.exports.entries())
      refer(owners, id, `modules[${i}].exports[${j}]`, 'module or provider');
  }

  return { modules, providers, edges };
}
