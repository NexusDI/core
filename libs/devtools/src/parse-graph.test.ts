import { describe, expect, it } from 'vitest';

import { isNexusError } from '@nexusdi/core';

import { DevtoolsError, parseGraph, type NexusGraph } from './index.js';

const GOOD: NexusGraph = {
  modules: [
    {
      id: 'm0',
      name: 'Meridian',
      global: false,
      imports: [],
      loadImports: [],
      exports: ['p0'],
    },
  ],
  providers: [
    {
      id: 'p0',
      token: 'NavCharts',
      module: 'm0',
      lifetime: 'singleton',
      kind: 'class',
      eager: true,
      async: false,
      notes: [],
      unresolved: [],
      implementation: 'StellarCharts',
      internal: false,
    },
    {
      id: 'request',
      token: 'REQUEST',
      module: 'm0',
      lifetime: 'scoped',
      kind: 'value',
      eager: true,
      async: false,
      notes: [],
      unresolved: [],
      implementation: null,
      internal: true,
    },
  ],
  edges: [{ from: 'p0', to: 'request', kind: 'required' }],
  unchecked: [],
};

const FIX =
  '\n  Fix: pass JSON.parse of the text that JSON.stringify(graph(ship)), JSON.stringify(inspect(root)) or nexusdi graph --format json wrote.';

/** The thrown error, parsed from a JSON round trip as a file would be. */
function failureOf(value: unknown): DevtoolsError {
  try {
    parseGraph(JSON.parse(JSON.stringify(value)));
  } catch (error) {
    expect(isNexusError(error, 'NEXUS_DEVTOOLS_GRAPH_INVALID')).toBe(true);
    return error as DevtoolsError;
  }
  throw new Error('parseGraph did not throw');
}

function withProvider(
  i: number,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...GOOD,
    providers: GOOD.providers.map((p, j) => (i === j ? { ...p, ...patch } : p)),
  };
}

describe('parseGraph', () => {
  it('returns a well-formed graph unchanged', () => {
    expect(parseGraph(JSON.parse(JSON.stringify(GOOD)))).toEqual(GOOD);
  });

  it('keeps the load imports of a module', () => {
    const loadImported = {
      ...GOOD,
      modules: [
        ...GOOD.modules,
        {
          id: 'm1',
          name: 'Science',
          global: false,
          imports: ['m0'],
          loadImports: ['m0'],
          exports: [],
        },
      ],
    };
    expect(parseGraph(JSON.parse(JSON.stringify(loadImported)))).toEqual(
      loadImported,
    );
  });

  it('reads a module with no loadImports field, as rc.2 graph files have, as loadImports: []', () => {
    // JSON.stringify drops an undefined field, as the rc.2 file lacks it.
    const old = { ...GOOD.modules[0], loadImports: undefined };
    const graph = parseGraph(
      JSON.parse(JSON.stringify({ ...GOOD, modules: [old] })),
    );
    expect(graph.modules[0]?.loadImports).toEqual([]);
  });

  it('keeps the unresolved deps of a provider', () => {
    const [first, ...rest] = GOOD.providers;
    const open = {
      ...GOOD,
      providers: [{ ...first, unresolved: ['SubspaceLink'] }, ...rest],
    } as NexusGraph;
    expect(parseGraph(JSON.parse(JSON.stringify(open)))).toEqual(open);
  });

  it('reads a provider with no unresolved field, as rc.2 graph files have, as unresolved: []', () => {
    const old = { ...GOOD.providers[0], unresolved: undefined };
    const graph = parseGraph(
      JSON.parse(
        JSON.stringify({
          ...GOOD,
          providers: [old, ...GOOD.providers.slice(1)],
        }),
      ),
    );
    expect(graph.providers[0]?.unresolved).toEqual([]);
  });

  it('keeps the unchecked modules of a graph', () => {
    const open = {
      ...GOOD,
      unchecked: [
        { module: 'Uplink', reason: 'async-schema' },
        { module: 'Comms', reason: 'for-root-async' },
      ],
    } as NexusGraph;
    expect(parseGraph(JSON.parse(JSON.stringify(open)))).toEqual(open);
  });

  it('reads a graph with no unchecked field, as rc.2 graph files have, as unchecked: []', () => {
    const old = { ...GOOD, unchecked: undefined };
    expect(parseGraph(JSON.parse(JSON.stringify(old))).unchecked).toEqual([]);
  });

  it('keeps an unchecked reason it does not know', () => {
    const future = {
      ...GOOD,
      unchecked: [{ module: 'Relay', reason: 'remote-schema' }],
    };
    expect(parseGraph(JSON.parse(JSON.stringify(future))).unchecked).toEqual([
      { module: 'Relay', reason: 'remote-schema' },
    ]);
  });

  it('returns a copy that shares no array with its input', () => {
    const input = JSON.parse(
      JSON.stringify({
        ...GOOD,
        unchecked: [{ module: 'Uplink', reason: 'async-schema' }],
      }),
    ) as NexusGraph;
    const graph = parseGraph(input);
    expect(graph.modules[0]?.exports).not.toBe(input.modules[0]?.exports);
    expect(graph.unchecked).not.toBe(input.unchecked);
    expect(graph.unchecked[0]).not.toBe(input.unchecked[0]);
  });

  it('throws DevtoolsError with the path and a Fix line', () => {
    const error = failureOf(withProvider(0, { module: 3 }));
    expect(error).toBeInstanceOf(DevtoolsError);
    expect(error).toMatchObject({
      code: 'NEXUS_DEVTOOLS_GRAPH_INVALID',
      path: 'providers[0].module',
      message: `[NEXUS_DEVTOOLS_GRAPH_INVALID] not a NexusGraph: providers[0].module is missing or has the wrong type.${FIX}`,
    });
  });

  it.each([
    [null, '(root)'],
    [[], '(root)'],
    [{ ...GOOD, edges: undefined }, 'edges'],
    [withProvider(0, { kind: 'magic' }), 'providers[0].kind'],
    [withProvider(0, { async: 'yes' }), 'providers[0].async'],
    [withProvider(0, { lifetime: 'forever' }), 'providers[0].lifetime'],
    [
      withProvider(0, { implementation: undefined }),
      'providers[0].implementation',
    ],
    [withProvider(0, { unresolved: [1] }), 'providers[0].unresolved[0]'],
    [{ ...GOOD, unchecked: 'none' }, 'unchecked'],
    [
      { ...GOOD, unchecked: [{ reason: 'async-schema' }] },
      'unchecked[0].module',
    ],
    [withProvider(1, { internal: undefined }), 'providers[1].internal'],
    [withProvider(1, { internal: 'yes' }), 'providers[1].internal'],
    [
      { ...GOOD, modules: [{ ...GOOD.modules[0], exports: [1] }] },
      'modules[0].exports[0]',
    ],
    [{ ...GOOD, edges: [{ from: 'p0', to: 'request' }] }, 'edges[0].kind'],
    [
      { ...GOOD, modules: [{ ...GOOD.modules[0], loadImports: 'm0' }] },
      'modules[0].loadImports',
    ],
    [
      { ...GOOD, modules: [{ ...GOOD.modules[0], loadImports: [1] }] },
      'modules[0].loadImports[0]',
    ],
  ])('names the bad path of %j: %s', (value, path) => {
    const error = failureOf(value);
    expect(error.path).toBe(path);
    expect(error.message).toContain(
      `not a NexusGraph: ${path} is missing or has the wrong type.`,
    );
  });

  it.each([
    [
      { ...GOOD, edges: [{ from: 'p0', to: 'p9', kind: 'required' }] },
      'edges[0].to',
      '"p9", which no provider has',
    ],
    [
      { ...GOOD, edges: [{ from: 'm0', to: 'p0', kind: 'required' }] },
      'edges[0].from',
      '"m0", which no provider has',
    ],
    [
      withProvider(0, { module: 'm7' }),
      'providers[0].module',
      '"m7", which no module has',
    ],
    [
      { ...GOOD, modules: [{ ...GOOD.modules[0], imports: ['m3'] }] },
      'modules[0].imports[0]',
      '"m3", which no module has',
    ],
    [
      { ...GOOD, modules: [{ ...GOOD.modules[0], loadImports: ['m3'] }] },
      'modules[0].loadImports[0]',
      '"m3", which no module has',
    ],
    [
      { ...GOOD, modules: [{ ...GOOD.modules[0], exports: ['p0', 'p5'] }] },
      'modules[0].exports[1]',
      '"p5", which no module or provider has',
    ],
  ])('rejects a dangling reference in %j', (value, path, rest) => {
    const error = failureOf(value);
    expect(error.path).toBe(path);
    expect(error.message).toBe(
      `[NEXUS_DEVTOOLS_GRAPH_INVALID] not a NexusGraph: ${path} is ${rest}.${FIX}`,
    );
  });

  it('rejects two providers with the same id', () => {
    const error = failureOf({
      ...GOOD,
      providers: [GOOD.providers[0], GOOD.providers[0], GOOD.providers[1]],
    });
    expect(error.path).toBe('providers[1].id');
    expect(error.message).toContain(
      'providers[1].id is "p0", which providers[0].id already uses.',
    );
  });

  it('rejects a provider that takes a module id', () => {
    const error = failureOf(withProvider(0, { id: 'm0' }));
    expect(error.message).toContain(
      'providers[0].id is "m0", which modules[0].id already uses.',
    );
  });

  it('rejects two modules with the same id', () => {
    expect(
      failureOf({ ...GOOD, modules: [GOOD.modules[0], GOOD.modules[0]] })
        .message,
    ).toContain('modules[1].id is "m0", which modules[0].id already uses.');
  });

  it.each(['end', 'call', 'a-->b', 'say "hi"', ''])(
    'takes any string as an id: %j',
    (id) => {
      const graph = {
        ...GOOD,
        modules: [{ ...GOOD.modules[0], exports: [id] }],
        providers: [{ ...GOOD.providers[0], id }, GOOD.providers[1]],
        edges: [{ from: id, to: 'request', kind: 'required' }],
      };
      expect(parseGraph(graph)).toEqual(graph);
    },
  );
});
